"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { audit } from "@/lib/inventory/service";
import { adminUser, run, userError } from "@/lib/admin/guard";
import { generateMissingUnits, towerWithSeries, type TowerStyle } from "@/lib/admin/units-db";
import { unitPatchSchema } from "@/lib/admin/units";

const text = z.string().trim().max(200).nullable().transform((v) => v || null);
const area = z.number().min(0).max(1e6).nullable();
const seriesSchema = z.object({
  series: z.number().int().min(0).max(999),
  bhk: text, typeLabel: text, description: text, facing: text, direction: text, view: text, tier: text,
  carpet: area, balcony: area, sbua: area, uds: area,
  corner: z.boolean(),
  tags: unitPatchSchema.shape.tags.unwrap(),
  priceAttrs: unitPatchSchema.shape.priceAttrs.unwrap(),
});
const towerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(10),
  floors: z.number().int().min(0).max(200),
  startFloor: z.number().int().min(-10).max(200),
  basements: z.number().int().min(0).max(10),
  unitsPerFloor: z.number().int().min(1).max(100),
  unitNumberFormat: z.string().trim().min(3).max(60).refine((f) => f.includes("{floor") && f.includes("{series"), "Format needs {floor} and {series}"),
  series: z.array(seriesSchema).max(100).refine((a) => new Set(a.map((x) => x.series)).size === a.length, "Series numbers must be unique"),
});
export type TowerInput = z.input<typeof towerSchema>;

const num = (v: number | null) => (v === null ? null : String(v));

export async function saveTowerAction(projectId: string, towerId: string | null, input: TowerInput) {
  return run(async () => {
    const user = await adminUser("project.manage");
    const v = towerSchema.parse(input);
    if (v.startFloor > v.floors) throw userError("Start floor is above the top floor");
    const db = await getDb();
    const id = await db.transaction(async (tx) => {
      const project = await tx.query.projects.findFirst({ where: eq(s.projects.id, projectId) });
      if (!project) throw userError("Project not found", 404);
      const before = towerId ? await towerWithSeries(tx, towerId) : null;
      if (before && before.tower.projectId !== projectId) throw userError("Tower not found", 404);
      const style: TowerStyle = { ...(before?.style ?? {}), startFloor: v.startFloor, series: Object.fromEntries(v.series.map((x) => [x.series, { corner: x.corner, tags: x.tags, priceAttrs: x.priceAttrs }])) };
      const values = { name: v.name, code: v.code, floors: v.floors, basements: v.basements, unitsPerFloor: v.unitsPerFloor, unitNumberFormat: v.unitNumberFormat, style: style as typeof s.towers.$inferInsert.style };
      const [tower] = before
        ? await tx.update(s.towers).set(values).where(eq(s.towers.id, before.tower.id)).returning()
        : await tx.insert(s.towers).values({ ...values, projectId }).returning();

      const keep = new Set(v.series.map((x) => x.series));
      const removed = (before?.series ?? []).filter((r) => !keep.has(r.series));
      if (removed.length) {
        const used = await tx.$count(s.units, inArray(s.units.seriesId, removed.map((r) => r.id)));
        if (used) throw userError(`Series ${removed.map((r) => r.series).join(", ")} already have units; edit them instead of removing`, 409);
        await tx.delete(s.unitSeries).where(inArray(s.unitSeries.id, removed.map((r) => r.id)));
      }
      for (const x of v.series) {
        const row = { bhk: x.bhk, typeLabel: x.typeLabel, description: x.description, facing: x.facing, direction: x.direction, view: x.view, tier: x.tier, carpet: num(x.carpet), balcony: num(x.balcony), sbua: num(x.sbua), uds: num(x.uds) };
        const existing = before?.series.find((r) => r.series === x.series);
        if (existing) await tx.update(s.unitSeries).set(row).where(eq(s.unitSeries.id, existing.id));
        else await tx.insert(s.unitSeries).values({ ...row, towerId: tower.id, series: x.series });
      }
      const summary = (t: typeof tower | undefined, series: unknown) => (t ? { name: t.name, code: t.code, floors: t.floors, basements: t.basements, unitsPerFloor: t.unitsPerFloor, unitNumberFormat: t.unitNumberFormat, startFloor: (t.style as TowerStyle | null)?.startFloor ?? 0, series } : null);
      await audit(tx, { actorId: user.id, action: before ? "tower.update" : "tower.create", entity: "tower", entityId: tower.id, before: summary(before?.tower, before?.series.map((r) => ({ ...r, ...before.style.series?.[r.series] }))), after: summary(tower, v.series) });
      return tower.id;
    });
    revalidatePath("/app", "layout");
    return { id };
  });
}

export async function deleteTowerAction(towerId: string) {
  return run(async () => {
    const user = await adminUser("project.manage");
    const db = await getDb();
    await db.transaction(async (tx) => {
      const { tower, series } = await towerWithSeries(tx, towerId);
      if (await tx.$count(s.units, eq(s.units.towerId, towerId))) throw userError("This tower has units; it can't be deleted", 409);
      await tx.delete(s.unitSeries).where(eq(s.unitSeries.towerId, towerId));
      await tx.delete(s.towers).where(and(eq(s.towers.id, towerId)));
      await audit(tx, { actorId: user.id, action: "tower.delete", entity: "tower", entityId: towerId, before: { name: tower.name, code: tower.code, series: series.length } });
    });
    revalidatePath("/app", "layout");
    return true;
  });
}

/** apply=false is a dry run: how many units would be created and sample numbers. */
export async function generateUnitsAction(towerId: string, apply: boolean) {
  return run(async () => {
    const user = await adminUser("inventory.edit");
    const r = await generateMissingUnits(await getDb(), user.id, towerId, apply);
    if (apply) revalidatePath("/app", "layout");
    return r;
  });
}
