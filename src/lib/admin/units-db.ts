// DB writes for the admin unit editor, import and unit generation. Each call is one transaction with audit rows.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { audit } from "@/lib/inventory/service";
import { generateUnits, type SeriesSpec } from "@/lib/inventory/generate";
import { MANUAL_STATUSES, unitToFields, type UnitChange, type UnitFields, type UnitPatch } from "./units";
import { userError } from "./errors";

type Unit = typeof s.units.$inferSelect;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * towers.style also carries what the schema has no columns for: the first floor and per-series corner/tags/price attrs.
 * shortcut: lives in jsonb until unit_series gets corner/tags/price_attrs columns and towers gets start_floor.
 */
export type TowerStyle = { template?: string; color?: string; startFloor?: number; series?: Record<string, { corner?: boolean; tags?: string[]; priceAttrs?: Record<string, number> }> };

export const UNIT_KIND = { residential: "apartment", plotted: "plot", villa: "villa", row_house: "row_house", commercial: "commercial" } as const;

const str = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));

function toColumns(patch: UnitPatch, cur: Unit | null, towerId: (code: string) => string) {
  const set: Partial<typeof s.units.$inferInsert> = {};
  for (const [k, v] of Object.entries(patch) as [keyof UnitPatch, never][]) {
    switch (k) {
      case "carpet": case "balcony": case "sbua": case "uds": case "plotAreaSqft": case "plotAreaSqm":
        set[k] = str(v);
        break;
      case "towerCode":
        set.towerId = v ? towerId(v) : null;
        break;
      case "avenue":
        set.details = { ...(set.details ?? cur?.details ?? {}), avenue: v };
        break;
      case "planX": case "planY":
        set.plan = { ...(set.plan ?? cur?.plan ?? {}), [k === "planX" ? "x" : "y"]: v ?? undefined };
        break;
      default:
        (set as Record<string, unknown>)[k] = v;
    }
  }
  const status = set.status ?? cur?.status ?? "available";
  if (status === "blocked") set.blockedReason = (patch.blockedReason ?? cur?.blockedReason) || "Management block";
  else if (patch.status === "available") set.blockedReason = null;
  return set;
}

const pick = (f: UnitFields, keys: string[]) => Object.fromEntries(keys.map((k) => [k, f[k as keyof UnitFields]]));

/** Saves edited cells / imported rows. Status may only move between available and blocked; numbers stay unique. */
export async function applyUnitChanges(db: DB, actorId: string, projectId: string, items: UnitChange[]) {
  return db.transaction(async (tx) => {
    const project = await tx.query.projects.findFirst({ where: eq(s.projects.id, projectId) });
    if (!project) throw userError("Project not found", 404);
    const towers = await tx.query.towers.findMany({ where: eq(s.towers.projectId, projectId) });
    const codeOf = (id: string) => towers.find((t) => t.id === id)?.code;
    const towerId = (code: string) => {
      const t = towers.find((t) => t.code.toLowerCase() === code.toLowerCase() || t.name.toLowerCase() === code.toLowerCase());
      if (!t) throw userError(`Unknown tower "${code}"`);
      return t.id;
    };

    const ids = items.flatMap((i) => (i.id ? [i.id] : []));
    const locked = ids.length ? await tx.select().from(s.units).where(and(eq(s.units.projectId, projectId), inArray(s.units.id, ids))).for("update") : [];
    const byId = new Map(locked.map((u) => [u.id, u]));

    // Unit numbers must stay unique per project after all renames in this batch.
    const all = await tx.select({ id: s.units.id, number: s.units.number }).from(s.units).where(eq(s.units.projectId, projectId));
    const numbers = new Map(all.map((u) => [u.id, u.number]));
    items.forEach((it, i) => it.patch.number && numbers.set(it.id ?? `new-${i}`, it.patch.number));
    const seen = new Set<string>();
    for (const n of numbers.values()) {
      if (seen.has(n.toLowerCase())) throw userError(`Unit number ${n} would be used twice`);
      seen.add(n.toLowerCase());
    }

    let created = 0;
    let updated = 0;
    for (const it of items) {
      const keys = Object.keys(it.patch);
      if (it.id) {
        const u = byId.get(it.id);
        if (!u) throw userError("A unit you edited no longer exists in this project; reload and try again", 409);
        if (!keys.length) continue;
        if (it.patch.status && it.patch.status !== u.status && (!MANUAL_STATUSES.includes(it.patch.status) || !MANUAL_STATUSES.includes(u.status))) {
          throw userError(`${u.number} is ${u.status.replace("_", " ")}; only available ↔ blocked can be changed here`, 409);
        }
        const set = toColumns(it.patch, u, towerId);
        const statusChanged = set.status !== undefined && set.status !== u.status;
        const [after] = await tx.update(s.units).set({ ...set, updatedAt: new Date(), ...(statusChanged && { version: u.version + 1 }) }).where(eq(s.units.id, u.id)).returning();
        await audit(tx, { actorId, action: "unit.update", entity: "unit", entityId: u.id, before: pick(unitToFields(u, codeOf), keys), after: pick(unitToFields(after, codeOf), keys) });
        updated++;
      } else {
        if (!it.patch.number) throw userError("New units need a unit number");
        if (it.patch.status && !MANUAL_STATUSES.includes(it.patch.status)) throw userError(`New unit ${it.patch.number} can only be available or blocked`);
        const set = toColumns(it.patch, null, towerId);
        const [row] = await tx.insert(s.units).values({ ...set, number: it.patch.number, projectId, kind: UNIT_KIND[project.type] }).returning();
        await audit(tx, { actorId, action: "unit.create", entity: "unit", entityId: row.id, after: unitToFields(row, codeOf) });
        created++;
      }
    }
    return { created, updated };
  });
}

/** All units of a project as editable fields, in natural order (tower, floor, number). */
export async function loadUnitFields(db: DB, projectId: string) {
  const [towers, units] = await Promise.all([
    db.query.towers.findMany({ where: eq(s.towers.projectId, projectId) }),
    db.query.units.findMany({ where: eq(s.units.projectId, projectId) }),
  ]);
  const codeOf = (id: string) => towers.find((t) => t.id === id)?.code;
  const fields = units.map((u) => ({ id: u.id, ...unitToFields(u, codeOf) }));
  const cmp = (a?: string | null, b?: string | null) => (a ?? "").localeCompare(b ?? "", "en", { numeric: true });
  fields.sort((a, b) => cmp(a.towerCode, b.towerCode) || (a.floor ?? 0) - (b.floor ?? 0) || cmp(a.number, b.number));
  return { towers, fields };
}

export async function towerWithSeries(db: DB | Tx, towerId: string) {
  const tower = await db.query.towers.findFirst({ where: eq(s.towers.id, towerId) });
  if (!tower) throw userError("Tower not found", 404);
  const series = await db.query.unitSeries.findMany({ where: eq(s.unitSeries.towerId, towerId), orderBy: asc(s.unitSeries.series) });
  return { tower, series, style: (tower.style ?? {}) as TowerStyle };
}

const n = (v: string | null) => (v === null ? undefined : Number(v));

/** Units the tower's structure implies but that don't exist yet. Existing numbers are skipped, never overwritten. */
export async function generateMissingUnits(db: DB, actorId: string, towerId: string, apply: boolean) {
  const run = async (tx: Tx) => {
    const { tower, series, style } = await towerWithSeries(tx, towerId);
    if (!series.length) throw userError("Add at least one series to this tower first");
    const project = (await tx.query.projects.findFirst({ where: eq(s.projects.id, tower.projectId) }))!;
    const specs: SeriesSpec[] = series.map((r) => {
      const extra = style.series?.[r.series] ?? {};
      return { series: r.series, bhk: r.bhk ?? undefined, typeLabel: r.typeLabel ?? undefined, description: r.description ?? undefined, facing: r.facing ?? undefined, direction: r.direction ?? undefined, view: r.view ?? undefined, tier: r.tier ?? undefined, carpet: n(r.carpet), balcony: n(r.balcony), sbua: n(r.sbua), uds: n(r.uds), ...extra };
    });
    let planned;
    try {
      planned = generateUnits({ code: tower.code, floors: tower.floors, startFloor: style.startFloor ?? 0, unitNumberFormat: tower.unitNumberFormat }, specs);
    } catch (e) {
      throw userError((e as Error).message);
    }
    const existing = new Set((await tx.select({ number: s.units.number }).from(s.units).where(eq(s.units.projectId, tower.projectId))).map((u) => u.number.toLowerCase()));
    const missing = planned.filter((u) => !existing.has(u.number.toLowerCase()));
    const seriesId = new Map(series.map((r) => [r.series, r.id]));
    if (apply && missing.length) {
      const rows = missing.map((u) => ({
        projectId: tower.projectId,
        phaseId: tower.phaseId,
        towerId: tower.id,
        seriesId: seriesId.get(u.series),
        kind: UNIT_KIND[project.type],
        number: u.number,
        floor: u.floor,
        bhk: u.bhk,
        typeLabel: u.typeLabel,
        description: u.description,
        carpet: str(u.carpet),
        balcony: str(u.balcony),
        sbua: str(u.sbua),
        uds: str(u.uds),
        facing: u.facing,
        direction: u.direction,
        view: u.view,
        tier: u.tier,
        corner: !!u.corner,
        tags: u.tags ?? [],
        priceAttrs: u.priceAttrs ?? {},
      }));
      for (let i = 0; i < rows.length; i += 500) await tx.insert(s.units).values(rows.slice(i, i + 500));
      await audit(tx, { actorId, action: "tower.generate_units", entity: "tower", entityId: tower.id, after: { created: missing.length, numbers: missing.map((u) => u.number) } });
    }
    return { planned: planned.length, existing: planned.length - missing.length, toCreate: missing.length, sample: missing.slice(0, 8).map((u) => u.number), created: apply ? missing.length : 0 };
  };
  return db.transaction(run);
}
