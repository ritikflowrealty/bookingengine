// Price-list versions: validation at the trust boundary and the draft → active → archived lifecycle.
import { and, eq, max, ne } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { audit } from "@/lib/inventory/service";
import { userError } from "./errors";
import { blankConfig, parseConfig } from "./pricelist-config";

type PriceList = typeof s.priceLists.$inferSelect;
const brief = (p: PriceList) => ({ name: p.name, version: p.version, status: p.status });

async function load(db: DB | Parameters<Parameters<DB["transaction"]>[0]>[0], id: string) {
  const [pl] = await db.select().from(s.priceLists).where(eq(s.priceLists.id, id)).for("update");
  if (!pl) throw userError("Price list not found", 404);
  return pl;
}

async function nextVersion(db: DB | Parameters<Parameters<DB["transaction"]>[0]>[0], projectId: string, name: string) {
  const [r] = await db.select({ v: max(s.priceLists.version) }).from(s.priceLists).where(and(eq(s.priceLists.projectId, projectId), eq(s.priceLists.name, name)));
  return (r?.v ?? 0) + 1;
}

export async function createDraft(db: DB, actorId: string, projectId: string, name: string) {
  return db.transaction(async (tx) => {
    const project = await tx.query.projects.findFirst({ where: eq(s.projects.id, projectId) });
    if (!project) throw userError("Project not found", 404);
    const [pl] = await tx
      .insert(s.priceLists)
      .values({ projectId, name, version: await nextVersion(tx, projectId, name), status: "draft", config: blankConfig(project.type, Number(project.gstRate)), createdBy: actorId })
      .returning();
    await audit(tx, { actorId, action: "pricelist.create", entity: "price_list", entityId: pl.id, after: brief(pl) });
    return pl;
  });
}

/** Copies any version into a new draft (same name, next version number). */
export async function duplicatePriceList(db: DB, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const src = await load(tx, id);
    const [pl] = await tx
      .insert(s.priceLists)
      .values({ projectId: src.projectId, phaseId: src.phaseId, name: src.name, version: await nextVersion(tx, src.projectId, src.name), status: "draft", validFrom: null, validTo: null, config: src.config, createdBy: actorId })
      .returning();
    await audit(tx, { actorId, action: "pricelist.duplicate", entity: "price_list", entityId: pl.id, before: { from: src.id, ...brief(src) }, after: brief(pl) });
    return pl;
  });
}

export async function saveDraft(db: DB, actorId: string, id: string, input: { name: string; validFrom: Date | null; validTo: Date | null; config: unknown }) {
  const config = parseConfig(input.config);
  return db.transaction(async (tx) => {
    const pl = await load(tx, id);
    if (pl.status !== "draft") throw userError("Only drafts can be edited; duplicate this version to change it", 409);
    const name = input.name.trim();
    if (name !== pl.name) {
      const clash = await tx.query.priceLists.findFirst({ where: and(eq(s.priceLists.projectId, pl.projectId), eq(s.priceLists.name, name), eq(s.priceLists.version, pl.version)) });
      if (clash) throw userError(`"${name}" v${pl.version} already exists`, 409);
    }
    const [after] = await tx.update(s.priceLists).set({ name, validFrom: input.validFrom, validTo: input.validTo, config }).where(eq(s.priceLists.id, id)).returning();
    await audit(tx, { actorId, action: "pricelist.update", entity: "price_list", entityId: id, before: { name: pl.name, validFrom: pl.validFrom, validTo: pl.validTo, config: pl.config }, after: { name, validFrom: after.validFrom, validTo: after.validTo, config } });
    return after;
  });
}

/** Makes this version live and archives the project's previously active one. Bookings keep their frozen cost sheets. */
export async function activatePriceList(db: DB, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const pl = await load(tx, id);
    if (pl.status === "active") return pl;
    parseConfig(pl.config);
    const previous = await tx.update(s.priceLists).set({ status: "archived", validTo: new Date() }).where(and(eq(s.priceLists.projectId, pl.projectId), eq(s.priceLists.status, "active"), ne(s.priceLists.id, id))).returning();
    for (const p of previous) await audit(tx, { actorId, action: "pricelist.archive", entity: "price_list", entityId: p.id, before: { status: "active" }, after: { status: "archived", replacedBy: id } });
    const [after] = await tx.update(s.priceLists).set({ status: "active", validFrom: pl.validFrom ?? new Date(), validTo: pl.validTo && pl.validTo < new Date() ? null : pl.validTo }).where(eq(s.priceLists.id, id)).returning();
    await audit(tx, { actorId, action: "pricelist.activate", entity: "price_list", entityId: id, before: { status: pl.status }, after: { status: "active", replaced: previous.map((p) => p.id) } });
    return after;
  });
}

export async function archivePriceList(db: DB, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const pl = await load(tx, id);
    if (pl.status === "active") throw userError("This is the live price list. Activate another version instead; that archives this one.", 409);
    if (pl.status === "archived") return pl;
    const [after] = await tx.update(s.priceLists).set({ status: "archived" }).where(eq(s.priceLists.id, id)).returning();
    await audit(tx, { actorId, action: "pricelist.archive", entity: "price_list", entityId: id, before: { status: pl.status }, after: { status: "archived" } });
    return after;
  });
}
