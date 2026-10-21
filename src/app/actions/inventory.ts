"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { assertCan, can, DEFAULT_DISCOUNT_LIMITS, discountApprover, type TreeUser } from "@/lib/auth/permissions";
import { randomToken } from "@/lib/auth/password";
import { toCustomerView } from "@/lib/pricing/engine";
import { audit, extendHold, holdUnit, quote, releaseUnit, setBlocked, startBooking } from "@/lib/inventory/service";
import { normalizePhone } from "@/lib/auth/otp";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const err = e as Error & { status?: number };
    if (!err.status) console.error(e);
    return { ok: false, error: err.status ? err.message : "Something went wrong. Please try again." };
  }
}

/** Approved discount (PSF) this user may apply on this unit, if any. */
async function approvedDiscount(userId: string, unitId: string) {
  const db = await getDb();
  const rows = await db.query.approvals.findMany({ where: and(eq(s.approvals.type, "discount"), eq(s.approvals.requestedBy, userId), eq(s.approvals.unitId, unitId), eq(s.approvals.status, "approved")) });
  return Math.max(0, ...rows.map((r) => Number((r.payload as { discountPsf?: number }).discountPsf ?? 0)));
}

async function treeAndLimits(projectId: string) {
  const db = await getDb();
  const [users, project] = await Promise.all([db.query.users.findMany(), db.query.projects.findFirst({ where: eq(s.projects.id, projectId) })]);
  return { tree: new Map<string, TreeUser>(users.map((u) => [u.id, u])), limits: { ...DEFAULT_DISCOUNT_LIMITS, ...(project?.discountLimits ?? {}) } };
}

export async function getQuoteAction(unitId: string, opts: { discountPsf?: number; offer?: string } = {}) {
  return run(async () => {
    const user = await requireStaff();
    const db = await getDb();
    const unit = await db.query.units.findFirst({ where: eq(s.units.id, unitId) });
    if (!unit) throw Object.assign(new Error("Unit not found"), { status: 404 });
    assertCan(user.actor, "inventory.view", { projectId: unit.projectId });
    const discountPsf = Math.max(0, opts.discountPsf ?? 0);
    const { tree, limits } = await treeAndLimits(unit.projectId);
    let needsApprovalFrom: string | null = null;
    if (discountPsf > 0) {
      const approved = await approvedDiscount(user.id, unitId);
      if (discountPsf > approved) {
        try {
          needsApprovalFrom = discountApprover(tree, user.id, discountPsf, limits)?.name ?? null;
        } catch {
          needsApprovalFrom = "leadership";
        }
      }
    }
    const { sheet, priceList } = await quote(db, unitId, { offer: opts.offer, discount: discountPsf ? { psf: discountPsf, label: "Special discount" } : undefined });
    const internal = can(user.actor, "inventory.view_internal", { projectId: unit.projectId });
    const cfg = priceList.config;
    const offers = [...new Set([...(cfg.base.adjustments ?? []), ...cfg.charges].map((r) => r.when?.offer).filter((o): o is string => !!o))];
    return { sheet: internal ? sheet : toCustomerView(sheet), priceListName: priceList.name, needsApprovalFrom, internal, offers };
  });
}

export async function holdAction(unitId: string) {
  return run(async () => {
    const user = await requireStaff();
    const u = await holdUnit(await getDb(), user.actor, unitId);
    revalidatePath("/app", "layout");
    return { holdExpiresAt: u.holdExpiresAt };
  });
}

export async function releaseAction(unitId: string) {
  return run(async () => {
    const user = await requireStaff();
    await releaseUnit(await getDb(), user.actor, unitId);
    revalidatePath("/app", "layout");
    return true;
  });
}

export async function extendHoldAction(unitId: string, hours: number) {
  return run(async () => {
    const user = await requireStaff();
    const u = await extendHold(await getDb(), user.actor, unitId, Math.min(Math.max(hours, 1), 72));
    revalidatePath("/app", "layout");
    return { holdExpiresAt: u.holdExpiresAt };
  });
}

/** Sales managers can't extend holds themselves; this routes a request to their team lead. */
export async function requestExtensionAction(unitId: string, hours: number, comments?: string) {
  return run(async () => {
    const user = await requireStaff();
    const db = await getDb();
    const unit = (await db.query.units.findFirst({ where: eq(s.units.id, unitId) }))!;
    if (unit.heldBy !== user.id) throw Object.assign(new Error("You can only extend your own holds"), { status: 403 });
    const [a] = await db.insert(s.approvals).values({ type: "hold_extension", projectId: unit.projectId, unitId, requestedBy: user.id, approverId: user.managerId, payload: { hours }, comments }).returning();
    await audit(db, { actorId: user.id, action: "approval.request", entity: "approval", entityId: a.id, after: { type: "hold_extension", hours } });
    return true;
  });
}

export async function blockAction(unitId: string, blocked: boolean, reason?: string) {
  return run(async () => {
    const user = await requireStaff();
    await setBlocked(await getDb(), user.actor, unitId, blocked, reason);
    revalidatePath("/app", "layout");
    return true;
  });
}

export async function requestDiscountAction(unitId: string, discountPsf: number, comments?: string) {
  return run(async () => {
    const user = await requireStaff();
    const db = await getDb();
    const unit = (await db.query.units.findFirst({ where: eq(s.units.id, unitId) }))!;
    assertCan(user.actor, "costsheet.share", { projectId: unit.projectId });
    const { tree, limits } = await treeAndLimits(unit.projectId);
    const approver = discountApprover(tree, user.id, discountPsf, limits);
    if (!approver) throw Object.assign(new Error("This discount is within your limit; no approval needed"), { status: 400 });
    const [a] = await db.insert(s.approvals).values({ type: "discount", projectId: unit.projectId, unitId, requestedBy: user.id, approverId: approver.id, payload: { discountPsf, unitNumber: unit.number }, comments }).returning();
    await audit(db, { actorId: user.id, action: "approval.request", entity: "approval", entityId: a.id, after: { type: "discount", discountPsf } });
    return { approver: approver.id };
  });
}

export async function shareCostSheetAction(unitId: string, opts: { discountPsf?: number; offer?: string; customerName?: string }) {
  return run(async () => {
    const user = await requireStaff();
    const db = await getDb();
    const unit = (await db.query.units.findFirst({ where: eq(s.units.id, unitId) }))!;
    assertCan(user.actor, "costsheet.share", { projectId: unit.projectId });
    const discountPsf = opts.discountPsf ?? 0;
    if (discountPsf > 0) {
      const { tree, limits } = await treeAndLimits(unit.projectId);
      const ok = discountPsf <= (await approvedDiscount(user.id, unitId)) || (() => { try { return discountApprover(tree, user.id, discountPsf, limits) === null; } catch { return false; } })();
      if (!ok) throw Object.assign(new Error("Get this discount approved before sharing"), { status: 403 });
    }
    const { sheet, priceList } = await quote(db, unitId, { offer: opts.offer, discount: discountPsf ? { psf: discountPsf, label: "Special discount" } : undefined });
    const token = randomToken(12);
    const hours = priceList.config.validityHours ?? 24;
    await db.insert(s.shareLinks).values({ token, unitId, createdBy: user.id, customerName: opts.customerName?.trim() || null, costSheet: toCustomerView(sheet), expiresAt: new Date(Date.now() + hours * 3600_000) });
    await audit(db, { actorId: user.id, action: "costsheet.share", entity: "unit", entityId: unitId, after: { token, total: sheet.total, discountPsf } });
    return { token, path: `/s/${token}` };
  });
}

/** Staff starts a booking for a customer: finds or creates the customer by phone, freezes the price. */
export async function startStaffBookingAction(unitId: string, input: { phone: string; name: string; email?: string; discountPsf?: number }) {
  return run(async () => {
    const user = await requireStaff();
    const db = await getDb();
    const phone = normalizePhone(input.phone);
    if (!input.name.trim()) throw Object.assign(new Error("Customer name is required"), { status: 400 });
    const discountPsf = input.discountPsf ?? 0;
    if (discountPsf > 0) {
      const unit = (await db.query.units.findFirst({ where: eq(s.units.id, unitId) }))!;
      const { tree, limits } = await treeAndLimits(unit.projectId);
      let within = false;
      try { within = discountApprover(tree, user.id, discountPsf, limits) === null; } catch {}
      if (!within && discountPsf > (await approvedDiscount(user.id, unitId))) throw Object.assign(new Error("This discount needs approval first"), { status: 403 });
    }
    let customer = await db.query.customers.findFirst({ where: eq(s.customers.phone, phone) });
    if (!customer) [customer] = await db.insert(s.customers).values({ phone, name: input.name.trim(), email: input.email?.trim() || null }).returning();
    const booking = await startBooking(db, { unitId, customerId: customer.id, actor: user.actor, discountPsf, holdMinutes: 24 * 60 });
    revalidatePath("/app", "layout");
    return { bookingId: booking.id };
  });
}
