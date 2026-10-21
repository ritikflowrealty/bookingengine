import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { DB } from "@/db";
import { testDb } from "@/test/db";
import { applyUnitChanges, generateMissingUnits } from "./units-db";
import { activatePriceList, archivePriceList, duplicatePriceList, saveDraft } from "./pricelists";
import { createsCycle, flattenTree } from "./users";
import { diffKeys } from "./audit";

let db: DB;
let admin: string;
let sipani: typeof s.projects.$inferSelect;
beforeAll(async () => {
  db = await testDb();
  admin = (await db.query.users.findFirst({ where: eq(s.users.role, "super_admin") }))!.id;
  sipani = (await db.query.projects.findFirst({ where: eq(s.projects.slug, "sipani-city") }))!;
});

const unitBy = (status: "available" | "sold") => db.query.units.findFirst({ where: and(eq(s.units.projectId, sipani.id), eq(s.units.status, status)) });

describe("applyUnitChanges", () => {
  it("edits fields, blocks with a default reason and audits before/after", async () => {
    const u = (await unitBy("available"))!;
    await applyUnitChanges(db, admin, sipani.id, [{ id: u.id, patch: { sbua: 1111.5, status: "blocked", priceAttrs: { sourcingPsf: 7000 } } }]);
    const after = (await db.query.units.findFirst({ where: eq(s.units.id, u.id) }))!;
    expect([after.sbua, after.status, after.blockedReason, after.version, after.priceAttrs]).toEqual(["1111.50", "blocked", "Management block", u.version + 1, { sourcingPsf: 7000 }]);
    const log = await db.query.auditLog.findFirst({ where: and(eq(s.auditLog.entityId, u.id), eq(s.auditLog.action, "unit.update")) });
    expect(log?.before).toMatchObject({ sbua: Number(u.sbua), status: "available" });
    expect(log?.after).toMatchObject({ sbua: 1111.5, status: "blocked" });
  });

  it("rejects status changes on sold units and rolls back the whole batch", async () => {
    const free = (await unitBy("available"))!;
    const sold = (await unitBy("sold"))!;
    await expect(applyUnitChanges(db, admin, sipani.id, [{ id: free.id, patch: { tier: "Gold" } }, { id: sold.id, patch: { status: "available" } }])).rejects.toThrow(/only available ↔ blocked/);
    expect((await db.query.units.findFirst({ where: eq(s.units.id, free.id) }))!.tier).toBe(free.tier);
  });

  it("keeps unit numbers unique and creates new units", async () => {
    const u = (await unitBy("available"))!;
    await expect(applyUnitChanges(db, admin, sipani.id, [{ patch: { number: u.number } }])).rejects.toThrow(/used twice/);
    const r = await applyUnitChanges(db, admin, sipani.id, [{ patch: { number: "X-1", towerCode: "C", floor: 1, sbua: 1000 } }]);
    expect(r).toEqual({ created: 1, updated: 0 });
    const x = (await db.query.units.findFirst({ where: and(eq(s.units.projectId, sipani.id), eq(s.units.number, "X-1")) }))!;
    expect([x.kind, x.status, x.towerId !== null]).toEqual(["apartment", "available", true]);
  });
});

describe("generateMissingUnits", () => {
  it("previews, then creates only units that don't exist yet", async () => {
    const tower = (await db.query.towers.findFirst({ where: and(eq(s.towers.projectId, sipani.id), eq(s.towers.code, "C")) }))!;
    await db.update(s.towers).set({ floors: tower.floors + 1 }).where(eq(s.towers.id, tower.id));
    const preview = await generateMissingUnits(db, admin, tower.id, false);
    expect(preview).toMatchObject({ toCreate: 6, created: 0, sample: ["C-2301", "C-2302", "C-2303", "C-2304", "C-2305", "C-2306"] });
    const before = await db.$count(s.units, eq(s.units.towerId, tower.id));
    expect((await generateMissingUnits(db, admin, tower.id, true)).created).toBe(6);
    expect(await db.$count(s.units, eq(s.units.towerId, tower.id))).toBe(before + 6);
    expect((await generateMissingUnits(db, admin, tower.id, true)).created).toBe(0);
  });
});

describe("price lists", () => {
  it("duplicates into a draft, edits it, activates it and archives the old one", async () => {
    const live = (await db.query.priceLists.findFirst({ where: and(eq(s.priceLists.projectId, sipani.id), eq(s.priceLists.status, "active")) }))!;
    const draft = await duplicatePriceList(db, admin, live.id);
    expect([draft.status, draft.version]).toEqual(["draft", live.version + 1]);
    await expect(saveDraft(db, admin, live.id, { name: live.name, validFrom: null, validTo: null, config: live.config })).rejects.toThrow(/Only drafts/);
    const bad = { ...draft.config, paymentPlan: { ...draft.config.paymentPlan!, milestones: [{ label: "x", percent: 0.5 }] } };
    await expect(saveDraft(db, admin, draft.id, { name: draft.name, validFrom: null, validTo: null, config: bad })).rejects.toThrow(/50%/);
    await saveDraft(db, admin, draft.id, { name: draft.name, validFrom: null, validTo: null, config: { ...draft.config, validityHours: 48 } });
    await expect(archivePriceList(db, admin, live.id)).rejects.toThrow(/live price list/);
    await activatePriceList(db, admin, draft.id);
    const rows = await db.query.priceLists.findMany({ where: eq(s.priceLists.projectId, sipani.id) });
    expect(rows.map((r) => [r.version, r.status]).sort()).toEqual([[1, "archived"], [2, "active"]]);
    expect(rows.find((r) => r.id === draft.id)!.config.validityHours).toBe(48);
  });
});

describe("pure helpers", () => {
  it("detects reporting cycles and flattens the tree", () => {
    const users = [{ id: "a", managerId: null, name: "A" }, { id: "b", managerId: "a", name: "B" }, { id: "c", managerId: "b", name: "C" }];
    expect(createsCycle(users, "a", "c")).toBe(true);
    expect(createsCycle(users, "a", "a")).toBe(true);
    expect(createsCycle(users, "c", "a")).toBe(false);
    expect(flattenTree(users).map((r) => `${r.depth}${r.user.id}`)).toEqual(["0a", "1b", "2c"]);
  });

  it("diffs audit before/after", () => {
    expect(diffKeys({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })).toEqual([
      { key: "a", before: 1, after: 1, changed: false },
      { key: "b", before: 2, after: 3, changed: true },
      { key: "c", before: undefined, after: 4, changed: true },
    ]);
  });
});
