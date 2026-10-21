import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { computeCostSheet, type CostSheet, type PricingContext, type UnitPricingInput } from "@/lib/pricing/engine";
import { assertCan, can, type Actor } from "@/lib/auth/permissions";
import { nextStatus, unitStatusFor } from "@/lib/booking/state";

export type Unit = typeof s.units.$inferSelect;
export type Project = typeof s.projects.$inferSelect;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export class ConflictError extends Error {
  status = 409;
}

const INTERNAL_ATTRS = ["closingPsf", "sourcingPsf", "targetPsf"];

export async function audit(db: DB | Tx, e: { actorId?: string | null; actorType?: string; action: string; entity: string; entityId: string; before?: unknown; after?: unknown }) {
  await db.insert(s.auditLog).values({ actorType: "user", ...e, actorId: e.actorId ?? null });
}

export const n = (v: string | null | undefined) => (v === null || v === undefined ? undefined : Number(v));

export function pricingInput(u: Unit): UnitPricingInput {
  return {
    area: { sbua: n(u.sbua), carpet: n(u.carpet), terrace: n(u.terrace), plotArea: n(u.plotAreaSqft) },
    floor: u.floor ?? 0,
    tier: u.tier ?? undefined,
    tags: u.tags,
    attrs: u.priceAttrs,
  };
}

/** An expired hold counts as available everywhere, even before the cron releases it. */
export const effectiveStatus = (u: Pick<Unit, "status" | "holdExpiresAt">, now = new Date()) =>
  u.status === "on_hold" && u.holdExpiresAt && u.holdExpiresAt < now ? "available" : u.status;

/** Unit as the given viewer may see it: internal prices and landowner details stripped unless allowed. */
export function viewUnit(u: Unit, internal: boolean) {
  const priceAttrs = internal ? u.priceAttrs : Object.fromEntries(Object.entries(u.priceAttrs).filter(([k]) => !INTERNAL_ATTRS.includes(k)));
  return {
    ...u,
    status: effectiveStatus(u),
    priceAttrs,
    landownerShare: internal ? u.landownerShare : false,
    blockedReason: internal ? u.blockedReason : null,
    heldBy: internal ? u.heldBy : null,
  };
}
export type UnitView = ReturnType<typeof viewUnit>;

export async function listProjects(db: DB, actor?: Actor) {
  const rows = await db.query.projects.findMany({ orderBy: asc(s.projects.name) });
  return actor ? rows.filter((p) => can(actor, "inventory.view", { projectId: p.id, developerId: p.developerId })) : rows;
}

export async function getProject(db: DB, slug: string) {
  return db.query.projects.findFirst({ where: eq(s.projects.slug, slug) });
}

export async function getInventory(db: DB, projectId: string, internal: boolean) {
  const [towers, units] = await Promise.all([
    db.query.towers.findMany({ where: eq(s.towers.projectId, projectId), orderBy: asc(s.towers.name) }),
    db.query.units.findMany({ where: eq(s.units.projectId, projectId), orderBy: [asc(s.units.floor), asc(s.units.number)] }),
  ]);
  return { towers, units: units.map((u) => viewUnit(u, internal)), version: units.reduce((m, u) => Math.max(m, u.updatedAt.getTime()), 0) };
}

export async function statusCounts(db: DB, projectId?: string) {
  const rows = await db
    .select({ projectId: s.units.projectId, status: s.units.status, n: sql<number>`count(*)::int` })
    .from(s.units)
    .where(projectId ? eq(s.units.projectId, projectId) : undefined)
    .groupBy(s.units.projectId, s.units.status);
  return rows;
}

/** "First N bookings" tiers count units already booked or sold in the project. */
export async function bookedCount(db: DB, projectId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.units)
    .where(and(eq(s.units.projectId, projectId), inArray(s.units.status, ["booked", "sold"])));
  return r.n;
}

export async function activePriceList(db: DB, projectId: string) {
  const pl = await db.query.priceLists.findFirst({ where: and(eq(s.priceLists.projectId, projectId), eq(s.priceLists.status, "active")), orderBy: (p, { desc }) => desc(p.version) });
  if (!pl) throw new Error("This project has no active price list");
  return pl;
}

export async function quote(db: DB, unitId: string, ctx: Omit<PricingContext, "bookingsCount"> = {}) {
  const unit = await db.query.units.findFirst({ where: eq(s.units.id, unitId) });
  if (!unit) throw new Error("Unit not found");
  const [priceList, bookingsCount] = await Promise.all([activePriceList(db, unit.projectId), bookedCount(db, unit.projectId)]);
  const sheet: CostSheet = computeCostSheet(priceList.config, pricingInput(unit), { ...ctx, bookingsCount });
  return { unit, priceList, sheet };
}

async function lockUnit(tx: Tx, unitId: string) {
  const [u] = await tx.select().from(s.units).where(eq(s.units.id, unitId)).for("update");
  if (!u) throw new Error("Unit not found");
  return u;
}

/** Staff hold. Row-locked so two people can never hold or book the same unit. */
export async function holdUnit(db: DB, actor: Actor, unitId: string, opts: { hours?: number } = {}) {
  return db.transaction(async (tx) => {
    const u = await lockUnit(tx, unitId);
    assertCan(actor, "unit.hold", { projectId: u.projectId });
    if (effectiveStatus(u) !== "available") throw new ConflictError(`Unit ${u.number} is no longer available`);
    const project = await tx.query.projects.findFirst({ where: eq(s.projects.id, u.projectId) });
    const hours = opts.hours ?? project?.holdHours ?? 24;
    const [after] = await tx
      .update(s.units)
      .set({ status: "on_hold", heldBy: actor.id, holdExpiresAt: new Date(Date.now() + hours * 3600_000), bookingId: null, version: u.version + 1, updatedAt: new Date() })
      .where(eq(s.units.id, unitId))
      .returning();
    await audit(tx, { actorId: actor.id, action: "unit.hold", entity: "unit", entityId: unitId, before: { status: u.status }, after: { status: after.status, holdExpiresAt: after.holdExpiresAt } });
    return after;
  });
}

export async function releaseUnit(db: DB, actor: Actor, unitId: string) {
  return db.transaction(async (tx) => {
    const u = await lockUnit(tx, unitId);
    if (u.status !== "on_hold") throw new ConflictError(`Unit ${u.number} is not on hold`);
    const mine = u.heldBy === actor.id;
    if (!mine) assertCan(actor, "hold.extend.approve", { projectId: u.projectId }); // team lead and above can release others' holds
    if (u.bookingId) await cancelBookingTx(tx, u.bookingId, actor.id, "released");
    const [after] = await tx.update(s.units).set({ status: "available", heldBy: null, holdExpiresAt: null, bookingId: null, version: u.version + 1, updatedAt: new Date() }).where(eq(s.units.id, unitId)).returning();
    await audit(tx, { actorId: actor.id, action: "unit.release", entity: "unit", entityId: unitId, before: { status: u.status, heldBy: u.heldBy }, after: { status: "available" } });
    return after;
  });
}

export async function extendHold(db: DB, actor: Actor, unitId: string, hours: number) {
  return db.transaction(async (tx) => {
    const u = await lockUnit(tx, unitId);
    assertCan(actor, "hold.extend.approve", { projectId: u.projectId });
    if (u.status !== "on_hold") throw new ConflictError(`Unit ${u.number} is not on hold`);
    const base = u.holdExpiresAt && u.holdExpiresAt > new Date() ? u.holdExpiresAt : new Date();
    const [after] = await tx.update(s.units).set({ holdExpiresAt: new Date(base.getTime() + hours * 3600_000), version: u.version + 1, updatedAt: new Date() }).where(eq(s.units.id, unitId)).returning();
    await audit(tx, { actorId: actor.id, action: "unit.extend_hold", entity: "unit", entityId: unitId, before: { holdExpiresAt: u.holdExpiresAt }, after: { holdExpiresAt: after.holdExpiresAt } });
    return after;
  });
}

export async function setBlocked(db: DB, actor: Actor, unitId: string, blocked: boolean, reason?: string) {
  return db.transaction(async (tx) => {
    const u = await lockUnit(tx, unitId);
    const project = await tx.query.projects.findFirst({ where: eq(s.projects.id, u.projectId) });
    assertCan(actor, "inventory.block", { projectId: u.projectId, developerId: project?.developerId });
    if (blocked && effectiveStatus(u) !== "available") throw new ConflictError(`Only available units can be blocked`);
    if (!blocked && u.status !== "blocked") throw new ConflictError(`Unit ${u.number} is not blocked`);
    const [after] = await tx
      .update(s.units)
      .set({ status: blocked ? "blocked" : "available", blockedReason: blocked ? reason || "Management block" : null, landownerShare: blocked ? u.landownerShare : false, version: u.version + 1, updatedAt: new Date() })
      .where(eq(s.units.id, unitId))
      .returning();
    await audit(tx, { actorId: actor.id, action: blocked ? "unit.block" : "unit.unblock", entity: "unit", entityId: unitId, before: { status: u.status }, after: { status: after.status, reason } });
    return after;
  });
}

/**
 * Starts a booking: locks the unit, freezes the cost sheet and puts the unit on a short checkout hold.
 * `actor` is staff when a sales manager books for a customer; null for customer self-booking.
 */
export async function startBooking(
  db: DB,
  input: { unitId: string; customerId: string; leadId?: string | null; actor?: Actor | null; discountPsf?: number; holdMinutes?: number; salesManagerId?: string | null },
) {
  const { sheet, priceList, unit: snapshot } = await quote(db, input.unitId, input.discountPsf ? { discount: { psf: input.discountPsf } } : {});
  return db.transaction(async (tx) => {
    const u = await lockUnit(tx, input.unitId);
    if (input.actor) assertCan(input.actor, "booking.create", { projectId: u.projectId });
    const heldByMe = u.status === "on_hold" && input.actor && u.heldBy === input.actor.id && !u.bookingId;
    if (effectiveStatus(u) !== "available" && !heldByMe) throw new ConflictError(`Unit ${u.number} is no longer available`);
    if (u.version !== snapshot.version) throw new ConflictError(`Unit ${u.number} changed while you were viewing it; please reload`);
    const project = (await tx.query.projects.findFirst({ where: eq(s.projects.id, u.projectId) }))!;
    // A unit can have stale cancelled/draft bookings; the partial unique index guards live ones.
    const [booking] = await tx
      .insert(s.bookings)
      .values({
        unitId: u.id,
        projectId: u.projectId,
        customerId: input.customerId,
        leadId: input.leadId ?? null,
        priceListId: priceList.id,
        costSheet: sheet,
        discountPsf: String(input.discountPsf ?? 0),
        tokenAmount: project.tokenAmount,
        status: nextStatus("draft", "hold"),
        createdBy: input.actor?.id ?? null,
        salesManagerId: input.salesManagerId ?? (input.actor?.role === "sales_manager" ? input.actor.id : null),
      })
      .returning();
    const minutes = input.holdMinutes ?? project.checkoutHoldMinutes;
    const holdExpiresAt = heldByMe && u.holdExpiresAt ? u.holdExpiresAt : new Date(Date.now() + minutes * 60_000);
    await tx.update(s.units).set({ status: "on_hold", heldBy: input.actor?.id ?? null, holdExpiresAt, bookingId: booking.id, version: u.version + 1, updatedAt: new Date() }).where(eq(s.units.id, u.id));
    await audit(tx, { actorId: input.actor?.id ?? input.customerId, actorType: input.actor ? "user" : "customer", action: "booking.start", entity: "booking", entityId: booking.id, after: { unit: u.number, total: sheet.total } });
    return booking;
  });
}

/** Applies a booking event and keeps the unit status in step. */
export async function advanceBooking(db: DB | Tx, bookingId: string, event: Parameters<typeof nextStatus>[1], actorId: string | null, actorType = "user") {
  const run = async (tx: Tx) => {
    const [b] = await tx.select().from(s.bookings).where(eq(s.bookings.id, bookingId)).for("update");
    if (!b) throw new Error("Booking not found");
    const to = nextStatus(b.status, event);
    await tx.update(s.bookings).set({ status: to, updatedAt: new Date() }).where(eq(s.bookings.id, bookingId));
    const u = await lockUnit(tx, b.unitId);
    const unitStatus = unitStatusFor(to);
    await tx
      .update(s.units)
      .set({ status: unitStatus, bookingId: to === "cancelled" ? null : b.id, holdExpiresAt: unitStatus === "on_hold" ? u.holdExpiresAt : null, heldBy: unitStatus === "available" ? null : u.heldBy, version: u.version + 1, updatedAt: new Date() })
      .where(eq(s.units.id, b.unitId));
    await audit(tx, { actorId, actorType, action: `booking.${event}`, entity: "booking", entityId: bookingId, before: { status: b.status }, after: { status: to } });
    return { ...b, status: to };
  };
  return db.transaction(run); // nested calls become savepoints
}

async function cancelBookingTx(tx: Tx, bookingId: string, actorId: string | null, reason: string) {
  const [b] = await tx.select().from(s.bookings).where(eq(s.bookings.id, bookingId));
  if (!b || b.status === "cancelled") return;
  await tx.update(s.bookings).set({ status: nextStatus(b.status, b.status === "held" ? "expire" : "cancel"), updatedAt: new Date() }).where(eq(s.bookings.id, bookingId));
  await audit(tx, { actorId, action: "booking.cancel", entity: "booking", entityId: bookingId, before: { status: b.status }, after: { status: "cancelled", reason } });
}

/** Cron: release expired holds and cancel their checkout bookings. */
export async function expireHolds(db: DB) {
  return db.transaction(async (tx) => {
    const expired = await tx.select().from(s.units).where(and(eq(s.units.status, "on_hold"), lt(s.units.holdExpiresAt, new Date()))).for("update", { skipLocked: true });
    for (const u of expired) {
      if (u.bookingId) await cancelBookingTx(tx, u.bookingId, null, "hold expired");
      await tx.update(s.units).set({ status: "available", heldBy: null, holdExpiresAt: null, bookingId: null, version: u.version + 1, updatedAt: new Date() }).where(eq(s.units.id, u.id));
      await audit(tx, { actorType: "system", action: "unit.hold_expired", entity: "unit", entityId: u.id, before: { status: "on_hold" }, after: { status: "available" } });
    }
    return expired.length;
  });
}
