import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { diffImport, exportTable, mapHeaders, parseCsv, parseXlsx, readSheet, toCsv } from "./import";
import { parseCell, type UnitFields } from "./units";

const unit = (over: Partial<UnitFields & { id: string }> = {}): UnitFields & { id: string } => ({
  id: "00000000-0000-4000-8000-000000000001",
  number: "C-1401", towerCode: "C", floor: 14, bhk: "2BHK", typeLabel: "2BHK", description: null, facing: null, direction: "West", view: "City", tier: "Diamond",
  carpet: 701, balcony: 86, sbua: 1065, uds: 334, plotAreaSqft: null, plotAreaSqm: null, corner: false, tags: [], landownerShare: false,
  status: "available", blockedReason: null, avenue: null, planX: null, planY: null, priceAttrs: { sourcingPsf: 6820, closingPsf: 6720 },
  ...over,
});

describe("header mapping", () => {
  it("accepts developer sheet headers for apartments", () => {
    const { columns, ignored } = mapHeaders(["S.NO", "Flat No.", "Carpet Area (sq ft)", "S.B.U.A", "Direction", "Facing", "Tier", "Closing", "Sourcing", "PLC", "Car Park Value", "Remarks"]);
    const t = Object.fromEntries(columns.map((c) => [c.index, "field" in c.target ? c.target.field : `attr:${c.target.attr}`]));
    expect(t).toEqual({ 1: "number", 2: "carpet", 3: "sbua", 4: "direction", 5: "facing", 6: "tier", 7: "attr:closingPsf", 8: "attr:sourcingPsf", 9: "attr:plcPsf", 10: "attr:parkingValue" });
    expect(ignored).toEqual(["S.NO", "Remarks"]); // Flat No. outranks S.NO
    expect(mapHeaders(["Unit Name", "CARPET (Sft)", "SUBA"]).columns.map((c) => ("field" in c.target ? c.target.field : ""))).toEqual(["number", "carpet", "sbua"]);
  });

  it("accepts plot sheet headers", () => {
    const { columns } = mapHeaders(["S.NO", "Area in SQM", "Area in SQFT", "Type", "Facing", "Avenue", "Corner", "Facing Charges", "Premium Charges", "Corner Charges", "X%", "Y%"]);
    expect(columns.map((c) => ("field" in c.target ? c.target.field : c.target.attr))).toEqual(["number", "plotAreaSqm", "plotAreaSqft", "typeLabel", "facing", "avenue", "corner", "facingPsf", "parkPsf", "cornerPsf", "planX", "planY"]);
  });
});

describe("parsing", () => {
  it("parses quoted CSV and round-trips toCsv", () => {
    const rows = [["Unit No", "Price attrs"], ["C-1401", 'a=1, b=2'], ['He said "hi"', "x\ny"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
    expect(parseCsv("a,b\r\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("parses cells", () => {
    expect(parseCell("num", "₹6,930")).toEqual({ ok: true, value: 6930 });
    expect(parseCell("num", "abc").ok).toBe(false);
    expect(parseCell("bool", "Yes")).toEqual({ ok: true, value: true });
    expect(parseCell("status", "On Hold")).toEqual({ ok: true, value: "on_hold" });
    expect(parseCell("attrs", "sourcingPsf=6930, closingPsf=6,830")).toEqual({ ok: false, error: '"830" is not key=value' });
    expect(parseCell("attrs", "sourcingPsf=6930; closingPsf=6830")).toEqual({ ok: true, value: { sourcingPsf: 6930, closingPsf: 6830 } });
    expect(parseCell("attrs", '{"plcPsf": 250}')).toEqual({ ok: true, value: { plcPsf: 250 } });
    expect(parseCell("tags", "East, Corner;east")).toEqual({ ok: true, value: ["east", "corner"] });
  });

  it("skips title rows above the header", () => {
    const { records, mapped } = readSheet([["SIPANI CITY — INVENTORY"], [], ["Flat No.", "Closing"], ["C-1401", "6,900"], ["", ""]]);
    expect(mapped).toEqual([{ header: "Flat No.", to: "Unit No" }, { header: "Closing", to: "price attr closingPsf" }]);
    expect(records).toEqual([{ row: 4, cells: { number: "C-1401" }, attrs: { closingPsf: "6,900" } }]);
  });

  it("round-trips an export through XLSX", async () => {
    const u = unit({ tags: ["east"], corner: true });
    const { headers, rows } = exportTable([u], false);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Units");
    ws.addRow(["Title row"]);
    ws.addRow(headers);
    rows.forEach((r) => ws.addRow(r));
    const parsed = await parseXlsx(await wb.xlsx.writeBuffer());
    const diff = diffImport(readSheet(parsed).records, [u]);
    expect(diff).toMatchObject([{ kind: "unchanged", number: "C-1401" }]);
  });
});

describe("diffImport", () => {
  const existing = [unit(), unit({ id: "00000000-0000-4000-8000-000000000002", number: "C-1402", status: "sold" })];

  it("classifies new, changed, unchanged and error rows", () => {
    const { records } = readSheet([
      ["Flat No.", "Closing", "SBUA", "Status"],
      ["C-1401", "6900", "1065", ""],
      ["C-1402", "", "", "Sold"],
      ["C-1403", "7000", "1100", "Blocked"],
      ["C-1402", "", "", ""],
      ["", "1", "", ""],
      ["C-1404", "", "abc", "Booked"],
    ]);
    const d = diffImport(records, existing);
    expect(d.map((r) => r.kind)).toEqual(["changed", "unchanged", "new", "error", "error", "error"]);
    expect(d[0].patch).toEqual({ priceAttrs: { sourcingPsf: 6820, closingPsf: 6900 } }); // other attrs kept
    expect(d[0].changes).toEqual([{ field: "Price attrs", from: "sourcingPsf=6820, closingPsf=6720", to: "sourcingPsf=6820, closingPsf=6900" }]);
    expect(d[2].patch).toEqual({ number: "C-1403", priceAttrs: { closingPsf: 7000 }, sbua: 1100, status: "blocked" });
    expect(d[3].errors[0]).toMatch(/more than once/);
    expect(d[5].errors).toEqual(['SBUA: "abc" is not a number', expect.stringMatching(/available and blocked/)]);
  });

  it("refuses to change the status of a sold unit", () => {
    const d = diffImport(readSheet([["Unit No", "Status"], ["C-1402", "Available"]]).records, existing);
    expect(d[0].kind).toBe("error");
  });
});
