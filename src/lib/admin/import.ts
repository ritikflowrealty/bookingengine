// Unit import/export: developer-sheet header mapping, CSV/XLSX parsing and the preview diff.
import ExcelJS from "exceljs";
import { FIELD, FIELDS, formatCell, MANUAL_STATUSES, parseCell, sameValue, unitPatchSchema, type FieldKey, type UnitFields, type UnitPatch } from "./units";

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9%]/g, "");

// Earlier aliases win when a sheet has several columns for the same field (e.g. "Flat No." beats "S.NO").
const ALIASES: Partial<Record<FieldKey, string[]>> = {
  number: ["Unit Name", "Flat No.", "Unit Number", "Unit", "Flat", "Plot No", "Plot Number", "Plot", "S.NO", "Sl No"],
  towerCode: ["Tower Code", "Block"],
  floor: ["Floor No"],
  typeLabel: ["Unit Type", "Type Label"],
  bhk: ["Configuration", "Config"],
  carpet: ["Carpet Area (sq ft)", "CARPET (Sft)", "Carpet Area", "Carpet Area (sft)"],
  balcony: ["Balcony Area"],
  sbua: ["S.B.U.A", "SUBA", "Super Built Up Area", "Saleable Area", "SBUA (sq ft)"],
  plotAreaSqft: ["Area in SQFT", "Area (sq ft)", "Plot Area", "Area sqft", "Sqft"],
  plotAreaSqm: ["Area in SQM", "Area (sq m)", "Area sqm", "Sqm"],
  planX: ["X"],
  planY: ["Y"],
  landownerShare: ["LO Share", "Landowner"],
  status: ["Availability"],
  blockedReason: ["Block Reason"],
  priceAttrs: ["Price attributes"],
};
// Developer-sheet price columns become per-unit price attributes the price lists reference.
const ATTR_ALIASES: Record<string, string[]> = {
  sourcingPsf: ["Sourcing", "Sourcing PSF", "Sourcing Price"],
  closingPsf: ["Closing", "Closing PSF", "Closing Price"],
  plcPsf: ["PLC", "PLC PSF"],
  parkingValue: ["Car Park Value", "Car Parking Value", "Parking Value", "Car Park"],
  facingPsf: ["Facing Charges", "Facing Premium"],
  parkPsf: ["Premium Charges", "Park Premium"],
  cornerPsf: ["Corner Charges", "Corner Premium"],
};

type Target = { field: FieldKey; rank: number } | { attr: string; rank: number };
const LOOKUP = new Map<string, Target>();
for (const f of FIELDS) [f.label, ...(ALIASES[f.key] ?? [])].forEach((a, rank) => LOOKUP.set(norm(a), { field: f.key, rank }));
for (const [attr, names] of Object.entries(ATTR_ALIASES)) names.forEach((a, rank) => LOOKUP.set(norm(a), { attr, rank }));

export function headerTarget(h: string): Target | undefined {
  const m = h.trim().match(/^attr[:.]\s*([A-Za-z][A-Za-z0-9_]*)$/i); // generic "attr:targetPsf" columns
  return m ? { attr: m[1], rank: 0 } : LOOKUP.get(norm(h));
}

/** Column index → target, keeping the best-ranked column per field. */
export function mapHeaders(headers: string[]) {
  const best = new Map<string, { index: number; target: Target }>();
  headers.forEach((h, index) => {
    const target = h.trim() ? headerTarget(h) : undefined;
    if (!target) return;
    const key = "field" in target ? target.field : `attr:${target.attr}`;
    const prev = best.get(key);
    if (!prev || target.rank < prev.target.rank) best.set(key, { index, target });
  });
  const used = new Set([...best.values()].map((b) => b.index));
  return { columns: [...best.values()], ignored: headers.filter((h, i) => h.trim() && !used.has(i)) };
}

const findHeaderRow = (rows: string[][]) => rows.slice(0, 25).findIndex((r) => mapHeaders(r).columns.some((c) => "field" in c.target && c.target.field === "number"));

export type SheetRecord = { row: number; cells: Partial<Record<FieldKey, string>>; attrs: Record<string, string> };

/** Finds the header row (developer sheets often have title rows above it) and reads the rows below. */
export function readSheet(rows: string[][]) {
  const h = findHeaderRow(rows);
  if (h < 0) throw new Error("Couldn't find a header row with a unit number column (e.g. \"Unit No\", \"Flat No.\", \"Plot No\").");
  const { columns, ignored } = mapHeaders(rows[h]);
  const records: SheetRecord[] = [];
  rows.slice(h + 1).forEach((r, i) => {
    if (!r.some((c) => c?.trim())) return;
    const rec: SheetRecord = { row: h + i + 2, cells: {}, attrs: {} };
    for (const { index, target } of columns) {
      const v = (r[index] ?? "").trim();
      if (!v) continue; // an empty cell means "leave as is"
      if ("field" in target) rec.cells[target.field] = v;
      else rec.attrs[target.attr] = v;
    }
    records.push(rec);
  });
  const mapped = columns.map(({ index, target }) => ({ header: rows[h][index].trim(), to: "field" in target ? FIELD[target.field].label : `price attr ${target.attr}` }));
  return { records, mapped, ignored };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  const endRow = () => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (src[i + 1] === '"') cell += src[++i];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      endRow();
    } else cell += c;
  }
  if (cell || row.length) endRow();
  return rows;
}

export const toCsv = (rows: unknown[][]) =>
  rows.map((r) => r.map((v) => (v === null || v === undefined ? "" : String(v))).map((s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join(",")).join("\r\n") + "\r\n";

/** Rows of the first worksheet that has a recognisable header row (falls back to the first sheet). */
export async function parseXlsx(buf: ArrayBuffer | Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const sheets = wb.worksheets.map((ws) => {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text ?? "");
      rows[n - 1] = cells;
    });
    return Array.from(rows, (r) => r ?? []);
  });
  return sheets.find((r) => findHeaderRow(r) >= 0) ?? sheets[0] ?? [];
}

export async function parseUpload(name: string, buf: ArrayBuffer) {
  if (/\.xlsx$/i.test(name)) return parseXlsx(buf);
  if (/\.(csv|txt)$/i.test(name)) return parseCsv(new TextDecoder().decode(buf));
  throw new Error("Upload a .csv or .xlsx file");
}

// ---- Export ----

export const exportFields = (plotted: boolean) => FIELDS.filter((f) => f.only !== (plotted ? "apt" : "plot"));

export function exportTable(units: UnitFields[], plotted: boolean) {
  const fields = exportFields(plotted);
  return {
    headers: fields.map((f) => f.label),
    rows: units.map((u) => fields.map((f) => (f.type === "num" || f.type === "int" ? u[f.key] : formatCell(f.type, u[f.key])) as string | number | null)),
  };
}

// ---- Preview diff ----

export type DiffRow = {
  row: number;
  number: string;
  kind: "new" | "changed" | "unchanged" | "error";
  id?: string;
  changes: { field: string; from: string; to: string }[];
  errors: string[];
  patch: UnitPatch;
};

/** Matches sheet rows to existing units by number and works out what would change. Never touches the DB. */
export function diffImport(records: SheetRecord[], existing: (UnitFields & { id: string })[]): DiffRow[] {
  const byNumber = new Map(existing.map((u) => [u.number.trim().toLowerCase(), u]));
  const seen = new Set<string>();
  return records.map((rec) => {
    const number = rec.cells.number?.trim() ?? "";
    const out: DiffRow = { row: rec.row, number, kind: "unchanged", changes: [], errors: [], patch: {} };
    if (!number) return { ...out, kind: "error", errors: ["No unit number"] };
    const key = number.toLowerCase();
    if (seen.has(key)) return { ...out, kind: "error", errors: [`Unit ${number} appears more than once in the file`] };
    seen.add(key);
    const cur = byNumber.get(key);

    const next: Partial<UnitFields> = {};
    for (const [k, raw] of Object.entries(rec.cells) as [FieldKey, string][]) {
      if (k === "number") continue;
      const p = parseCell(FIELD[k].type, raw);
      if (p.ok) (next as Record<string, unknown>)[k] = p.value;
      else out.errors.push(`${FIELD[k].label}: ${p.error}`);
    }
    // Price columns merge into the unit's attributes; other attributes are kept.
    if (next.priceAttrs || Object.keys(rec.attrs).length) {
      const attrs = { ...(cur?.priceAttrs ?? {}), ...(next.priceAttrs ?? {}) };
      for (const [a, raw] of Object.entries(rec.attrs)) {
        const p = parseCell("num", raw);
        if (!p.ok) out.errors.push(`${a}: ${p.error}`);
        else if (p.value !== null) attrs[a] = p.value as number;
      }
      next.priceAttrs = attrs;
    }

    if (next.status && next.status !== (cur?.status ?? "available") && (!MANUAL_STATUSES.includes(next.status) || (cur && !MANUAL_STATUSES.includes(cur.status)))) {
      out.errors.push(`Status can only change between available and blocked here (holds and bookings set the others)`);
    }

    if (cur) {
      out.id = cur.id;
      if (cur.number !== number) next.number = number;
      for (const [k, v] of Object.entries(next) as [FieldKey, unknown][]) {
        if (sameValue(cur[k], v)) continue;
        (out.patch as Record<string, unknown>)[k] = v;
        out.changes.push({ field: FIELD[k].label, from: formatCell(FIELD[k].type, cur[k]), to: formatCell(FIELD[k].type, v) });
      }
      out.kind = out.changes.length ? "changed" : "unchanged";
    } else {
      out.patch = { ...next, number } as UnitPatch;
      out.changes = Object.entries(next).map(([k, v]) => ({ field: FIELD[k as FieldKey].label, from: "", to: formatCell(FIELD[k as FieldKey].type, v) }));
      out.kind = "new";
    }
    const valid = unitPatchSchema.safeParse(out.patch);
    if (!valid.success) out.errors.push(...valid.error.issues.map((i) => `${FIELD[i.path[0] as FieldKey]?.label ?? i.path.join(".")}: ${i.message}`));
    if (out.errors.length) out.kind = "error";
    return out;
  });
}
