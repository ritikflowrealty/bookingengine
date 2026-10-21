import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "@/test/db";
import * as s from "@/db/schema";
import type { DB } from "@/db";
import type { Actor } from "@/lib/auth/permissions";
import { advanceBooking, ConflictError, expireHolds, getProject, holdUnit, quote, releaseUnit, startBooking } from "./service";

let db: DB;
let sm: Actor;
let other: Actor;
const unitByNumber = async (projectSlug: string, number: string) => {
  const p = (await getProject(db, projectSlug))!;
  return (await db.query.units.findFirst({ where: and(eq(s.units.projectId, p.id), eq(s.units.number, number)) }))!;
};
const freeUnit = async (number: string) => {
  const u = await unitByNumber("sipani-city", number);
  await db.update(s.units).set({ status: "available", heldBy: null, holdExpiresAt: null, bookingId: null }).where(eq(s.units.id, u.id));
  return u.id;
};

beforeAll(async () => {
  db = await testDb();
  const u = (await db.query.users.findFirst({ where: eq(s.users.email, "sales@flowrealty.in") }))!;
  const projects = await db.query.projects.findMany();
  sm = { id: u.id, role: "sales_manager", projectIds: projects.map((p) => p.id) };
  other = { ...sm, id: "00000000-0000-0000-0000-000000000001" };
});

describe("inventory service (PGlite)", () => {
  it("prices a seeded unit exactly like the sheet", async () => {
    const id = await freeUnit("C-2104");
    const { sheet } = await quote(db, id);
    expect(Math.round(sheet.total)).toBe(8847000);
  });

  it("only one of two simultaneous holds wins", async () => {
    const id = await freeUnit("C-1401");
    const results = await Promise.allSettled([holdUnit(db, sm, id), holdUnit(db, other, id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
  });

  it("others cannot release my hold; I can", async () => {
    const id = await freeUnit("C-1402");
    await holdUnit(db, sm, id);
    await expect(releaseUnit(db, other, id)).rejects.toThrow(/Not allowed/);
    expect((await releaseUnit(db, sm, id)).status).toBe("available");
  });

  it("booking flow moves the unit through hold → booked, and cancel frees it", async () => {
    const id = await freeUnit("C-1403");
    const [c] = await db.insert(s.customers).values({ phone: "9999900002", name: "Test" }).returning();
    const b = await startBooking(db, { unitId: id, customerId: c.id });
    expect((await db.query.units.findFirst({ where: eq(s.units.id, id) }))!.status).toBe("on_hold");
    await expect(startBooking(db, { unitId: id, customerId: c.id })).rejects.toBeInstanceOf(ConflictError);
    await advanceBooking(db, b.id, "pay_token", null, "system");
    expect((await db.query.units.findFirst({ where: eq(s.units.id, id) }))!.status).toBe("booked");
    await advanceBooking(db, b.id, "cancel", sm.id);
    expect((await db.query.units.findFirst({ where: eq(s.units.id, id) }))!.status).toBe("available");
  });

  it("expired holds are released by the cron", async () => {
    const id = await freeUnit("C-1404");
    await holdUnit(db, sm, id);
    await db.update(s.units).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.units.id, id));
    expect(await expireHolds(db)).toBeGreaterThanOrEqual(1);
    expect((await db.query.units.findFirst({ where: eq(s.units.id, id) }))!.status).toBe("available");
  });
});
