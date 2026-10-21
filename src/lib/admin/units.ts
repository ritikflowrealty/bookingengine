// Editable unit fields shared by the bulk editor, CSV/XLSX export and import. Client-safe (no DB imports).
import { z } from "zod";
import { UNIT_STATUSES, type UnitStatus } from "@/lib/booking/state";

export type UnitFields = {
  number: string;
  towerCode: string | null;
  floor: number | null;
  bhk: string | null;
  typeLabel: string | null;
  description: string | null;
  facing: string | null;
  direction: string | null;
  view: string | null;
  tier: string | null;
  carpet: number | null;
  balcony: number | null;
  sbua: number | null;
  uds: number | null;
  plotAreaSqft: number | null;
  plotAreaSqm: number | null;
  corner: boolean;
  tags: string[];
  landownerShare: boolean;
  status: UnitStatus;
  blockedReason: string | null;
  avenue: string | null;
  planX: number | null;
  planY: number | null;
  priceAttrs: Record<string, number>;
};
export type FieldKey = keyof UnitFields;
export type FieldType = "text" | "int" | "num" | "bool" | "tags" | "attrs" | "status";

/** Column order for export; `label` is the exported header. `plot`/`apt` limit where the editor shows a column. */
export const FIELDS: { key: FieldKey; label: string; type: FieldType; only?: "plot" | "apt"; width?: number }[] = [
  { key: "number", label: "Unit No", type: "text", width: 96 },
  { key: "towerCode", label: "Tower", type: "text", only: "apt", width: 72 },
  { key: "floor", label: "Floor", type: "int", only: "apt", width: 64 },
  { key: "typeLabel", label: "Type", type: "text", width: 128 },
  { key: "bhk", label: "BHK", type: "text", only: "apt", width: 112 },
  { key: "description", label: "Description", type: "text", only: "apt", width: 176 },
  { key: "facing", label: "Facing", type: "text", width: 124 },
  { key: "direction", label: "Direction", type: "text", width: 124 },
  { key: "view", label: "View", type: "text", only: "apt", width: 104 },
  { key: "tier", label: "Tier", type: "text", only: "apt", width: 96 },
  { key: "carpet", label: "Carpet", type: "num", only: "apt", width: 80 },
  { key: "balcony", label: "Balcony", type: "num", only: "apt", width: 80 },
  { key: "sbua", label: "SBUA", type: "num", only: "apt", width: 80 },
  { key: "uds", label: "UDS", type: "num", only: "apt", width: 72 },
  { key: "plotAreaSqft", label: "Plot area (sq ft)", type: "num", only: "plot", width: 104 },
  { key: "plotAreaSqm", label: "Plot area (sq m)", type: "num", only: "plot", width: 96 },
  { key: "avenue", label: "Avenue", type: "text", only: "plot", width: 104 },
  { key: "planX", label: "X%", type: "num", only: "plot", width: 64 },
  { key: "planY", label: "Y%", type: "num", only: "plot", width: 64 },
  { key: "corner", label: "Corner", type: "bool", width: 72 },
  { key: "tags", label: "Tags", type: "tags", width: 136 },
  { key: "landownerShare", label: "Landowner share", type: "bool", width: 96 },
  { key: "status", label: "Status", type: "status", width: 132 },
  { key: "blockedReason", label: "Blocked reason", type: "text", width: 160 },
  { key: "priceAttrs", label: "Price attrs", type: "attrs", width: 260 },
];
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, (typeof FIELDS)[number]>;

/** Only these two statuses can be set by hand; the rest come from holds and bookings. */
export const MANUAL_STATUSES: UnitStatus[] = ["available", "blocked"];

const toNum = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

type UnitRow = {
  number: string; towerId: string | null; floor: number | null; bhk: string | null; typeLabel: string | null; description: string | null;
  facing: string | null; direction: string | null; view: string | null; tier: string | null;
  carpet: string | null; balcony: string | null; sbua: string | null; uds: string | null; plotAreaSqft: string | null; plotAreaSqm: string | null;
  corner: boolean; tags: string[]; landownerShare: boolean; status: UnitStatus; blockedReason: string | null;
  details: Record<string, unknown>; plan: { x?: number; y?: number } | null; priceAttrs: Record<string, number>;
};

export function unitToFields(u: UnitRow, towerCode: (id: string) => string | undefined = () => undefined): UnitFields {
  return {
    number: u.number,
    towerCode: u.towerId ? (towerCode(u.towerId) ?? null) : null,
    floor: u.floor,
    bhk: u.bhk,
    typeLabel: u.typeLabel,
    description: u.description,
    facing: u.facing,
    direction: u.direction,
    view: u.view,
    tier: u.tier,
    carpet: toNum(u.carpet),
    balcony: toNum(u.balcony),
    sbua: toNum(u.sbua),
    uds: toNum(u.uds),
    plotAreaSqft: toNum(u.plotAreaSqft),
    plotAreaSqm: toNum(u.plotAreaSqm),
    corner: u.corner,
    tags: u.tags,
    landownerShare: u.landownerShare,
    status: u.status,
    blockedReason: u.blockedReason,
    avenue: typeof u.details?.avenue === "string" ? u.details.avenue : null,
    planX: u.plan?.x ?? null,
    planY: u.plan?.y ?? null,
    priceAttrs: u.priceAttrs ?? {},
  };
}

// ---- Text <-> value, used by editor cells and imported sheets ----

export const formatAttrs = (a: Record<string, number>) => Object.entries(a).map(([k, v]) => `${k}=${v}`).join(", ");

export function formatCell(type: FieldType, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (type === "bool") return v ? "Yes" : "No";
  if (type === "tags") return (v as string[]).join(", ");
  if (type === "attrs") return formatAttrs(v as Record<string, number>);
  return String(v);
}

const cleanNumber = (s: string) => s.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
const STATUS_WORDS: Record<string, UnitStatus> = { available: "available", open: "available", unsold: "available", blocked: "blocked", block: "blocked", hold: "on_hold", on_hold: "on_hold", onhold: "on_hold", booked: "booked", sold: "sold", registered: "sold", sold_registered: "sold" };

/** "sourcingPsf=6930, closingPsf=6830" or a JSON object → { sourcingPsf: 6930, … }. */
export function parseAttrs(s: string): Record<string, number> {
  const t = s.trim();
  if (!t) return {};
  if (t.startsWith("{")) {
    const o = JSON.parse(t) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, attrValue(k, String(v))]));
  }
  return Object.fromEntries(
    t.split(/[,;\n]+/).filter((p) => p.trim()).map((p) => {
      const m = p.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*[=:]\s*(.+?)\s*$/);
      if (!m) throw new Error(`"${p.trim()}" is not key=value`);
      return [m[1], attrValue(m[1], m[2])];
    }),
  );
}
function attrValue(k: string, v: string) {
  const n = Number(cleanNumber(v));
  if (!Number.isFinite(n)) throw new Error(`${k} must be a number`);
  return n;
}

export type Parsed = { ok: true; value: unknown } | { ok: false; error: string };

export function parseCell(type: FieldType, raw: string): Parsed {
  const s = raw.trim();
  try {
    switch (type) {
      case "text":
        return { ok: true, value: s || null };
      case "int":
      case "num": {
        if (!s || s === "-") return { ok: true, value: null };
        const n = Number(cleanNumber(s));
        if (!Number.isFinite(n)) return { ok: false, error: `"${s}" is not a number` };
        if (type === "int" && !Number.isInteger(n)) return { ok: false, error: `"${s}" is not a whole number` };
        return { ok: true, value: n };
      }
      case "bool": {
        const v = s.toLowerCase();
        if (["", "no", "n", "false", "0", "-"].includes(v)) return { ok: true, value: false };
        if (["yes", "y", "true", "1", "corner", "x", "✓"].includes(v)) return { ok: true, value: true };
        return { ok: false, error: `"${s}" is not yes/no` };
      }
      case "tags":
        return { ok: true, value: [...new Set(s.split(/[,;|]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))] };
      case "attrs":
        return { ok: true, value: parseAttrs(s) };
      case "status": {
        const v = STATUS_WORDS[s.toLowerCase().replace(/[\s/-]+/g, "_")];
        return v ? { ok: true, value: v } : { ok: false, error: `Unknown status "${s}"` };
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Order-insensitive equality for the diff (tags and attrs compare by content). */
export function sameValue(a: unknown, b: unknown) {
  const norm = (v: unknown) => (Array.isArray(v) ? [...v].sort() : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort()) : (v ?? null));
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

// ---- Trust boundary: what a save request may contain ----

const text = z.string().trim().max(500).nullable().transform((v) => v || null);
const num = z.number().finite().min(0).max(1e9).nullable();
export const unitPatchSchema = z
  .object({
    number: z.string().trim().min(1, "Unit number is required").max(40),
    towerCode: z.string().trim().max(40).nullable(),
    floor: z.number().int().min(-10).max(300).nullable(),
    bhk: text,
    typeLabel: text,
    description: text,
    facing: text,
    direction: text,
    view: text,
    tier: text,
    carpet: num,
    balcony: num,
    sbua: num,
    uds: num,
    plotAreaSqft: num,
    plotAreaSqm: num,
    corner: z.boolean(),
    tags: z.array(z.string().trim().min(1).max(40)).max(40),
    landownerShare: z.boolean(),
    status: z.enum(UNIT_STATUSES),
    blockedReason: text,
    avenue: text,
    planX: z.number().min(0).max(100).nullable(),
    planY: z.number().min(0).max(100).nullable(),
    priceAttrs: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Attribute names are letters, digits and _"), z.number().finite()),
  })
  .partial()
  .strict();
export type UnitPatch = z.infer<typeof unitPatchSchema>;

export const unitChangesSchema = z.array(z.object({ id: z.uuid().optional(), patch: unitPatchSchema })).max(5000);
export type UnitChange = z.infer<typeof unitChangesSchema>[number];
