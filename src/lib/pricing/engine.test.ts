import { describe, expect, it } from "vitest";
import { computeCostSheet, toCustomerView, validatePriceList, type CostSheet } from "./engine";
import { riverineLaunch, sipaniCityFar, sumadhuraSolea } from "./presets";

// Golden values are copied from the reference Google Sheets (rounded to the rupee as the sheets display them).
const r = (n: number) => Math.round(n);
const line = (s: CostSheet, id: string) => r(s.lines.find((l) => l.id === id)?.amount ?? NaN);
const sub = (s: CostSheet, g: string) => r(s.subtotals.find((x) => x.group === g)!.amount);

describe("presets are valid", () => {
  it.each([sipaniCityFar, sumadhuraSolea, riverineLaunch])("plan adds to 100%", (cfg) => expect(validatePriceList(cfg)).toEqual([]));
});

describe("Sipani City FAR — Cost Sheet tab, C-2104", () => {
  const unit = { area: { sbua: 1065, terrace: 0 }, floor: 21, tier: "Platinum", attrs: { sourcingPsf: 6930, closingPsf: 6830 } };
  const s = computeCostSheet(sipaniCityFar, unit, { bookingsCount: 0 });

  it("matches every rupee", () => {
    expect(s.basePsf).toBe(7080);
    expect(line(s, "base") + line(s, "rounding")).toBe(7539964); // sheet's "Basic Flat Cost" folds the rounding in
    expect(line(s, "infra")).toBe(266250);
    expect(line(s, "parking")).toBe(300000);
    expect(line(s, "bescom")).toBe(319500);
    expect(sub(s, "A")).toBe(8425714);
    expect(r(s.gst!.amount)).toBe(421286);
    expect(r(s.total)).toBe(8847000);
    expect(r(s.effectivePsf)).toBe(8307);
    expect(r(s.registration[0].amount)).toBe(60322);
  });

  it("payment schedule", () => {
    expect(s.schedule.map((m) => r(m.amount)).slice(0, 6)).toEqual([884700, 884700, 884700, 884700, 542350, 442350]);
    expect(r(s.schedule.at(-2)!.amount)).toBe(221175);
    expect(r(s.schedule.reduce((a, m) => a + m.amount, 0))).toBe(8847000 + 100000);
  });

  it("matches the Window 1 decoder (Diamond 2BHK 85.56 L, Platinum 2BHK Luxe 1.05 Cr)", () => {
    expect(r(computeCostSheet(sipaniCityFar, { area: { sbua: 1065 }, tier: "Diamond", attrs: { sourcingPsf: 6820 } }).total)).toBe(8556000);
    expect(r(computeCostSheet(sipaniCityFar, { area: { sbua: 1280 }, tier: "Platinum", attrs: { sourcingPsf: 6930 } }).total)).toBe(10500000);
  });

  it("no rounding for sizes outside the decoder; no-offer cuts base by 150", () => {
    const s2 = computeCostSheet(sipaniCityFar, { area: { sbua: 1100 }, tier: "Diamond", attrs: { sourcingPsf: 6820 } }, { offer: "no_offer" });
    expect(s2.basePsf).toBe(6670);
    expect(s2.lines.some((l) => l.id === "rounding")).toBe(false);
    expect(r(s2.total)).toBe(r((1100 * (6670 + 250 + 300) + 300000) * 1.05));
  });

  it("discount reduces A after rounding and flags below-closing quotes", () => {
    const s2 = computeCostSheet(sipaniCityFar, unit, { discount: { psf: 150 } });
    expect(line(s2, "discount")).toBe(-159750);
    expect(r(s2.total)).toBe(r(8847000 - 159750 * 1.05));
    expect(s2.internal!.belowClosing).toBe(true); // 6930 sourcing − 150 = 6780 < 6830 closing
    expect(computeCostSheet(sipaniCityFar, unit, { discount: { psf: 100 } }).internal!.belowClosing).toBe(false);
  });

  it("terrace adds one third to chargeable area", () => {
    expect(computeCostSheet(sipaniCityFar, { area: { sbua: 1500, terrace: 300 }, attrs: { sourcingPsf: 6820 } }).area).toBe(1600);
  });

  it("customer view hides internal prices", () => {
    expect(JSON.stringify(toCustomerView(s))).not.toMatch(/closingPsf|sourcingPsf|quotedPsf/);
  });
});

describe("Sumadhura Solea — Cost Sheet tab, E-1207", () => {
  const unit = { area: { sbua: 2110 }, floor: 12, attrs: { plcPsf: 0, parkingValue: 800000 } };
  const s = computeCostSheet(sumadhuraSolea, unit, { bookingsCount: 5 });

  it("matches every rupee", () => {
    expect(line(s, "base")).toBe(26058500);
    expect(line(s, "club")).toBe(350000);
    expect(line(s, "utilities")).toBe(791250);
    expect(line(s, "floor_rise")).toBe(633000);
    expect(line(s, "parking")).toBe(800000);
    expect(s.lines.some((l) => l.id === "plc")).toBe(false); // zero lines are dropped
    expect(sub(s, "A")).toBe(28632750);
    expect(r(s.gst!.amount)).toBe(1431638);
    expect(r(s.total)).toBe(30064388);
    expect(r(s.registration[0].amount)).toBe(298776);
  });

  it("switches to the post-20-bookings base automatically", () => {
    expect(computeCostSheet(sumadhuraSolea, unit, { bookingsCount: 20 }).basePsf).toBe(12600);
  });

  it("floor rise starts at the 3rd floor", () => {
    const fr = (floor: number) => computeCostSheet(sumadhuraSolea, { ...unit, floor }).lines.find((l) => l.id === "floor_rise")?.amount ?? 0;
    expect([fr(0), fr(2), fr(3), fr(4)]).toEqual([0, 0, 30 * 2110, 60 * 2110]);
  });
});

describe("The Riverine — NR Cost sheet tab, plot 153", () => {
  const unit = { area: { plotArea: 2377.34 }, attrs: { facingPsf: 300, parkPsf: 0, cornerPsf: 0 } };
  const s = computeCostSheet(riverineLaunch, unit, { bookingsCount: 50 });

  it("matches every rupee", () => {
    expect(s.basePsf).toBe(3499);
    expect(sub(s, "A")).toBe(8318313);
    expect(sub(s, "B")).toBe(713202);
    expect(line(s, "club")).toBe(236000);
    expect(line(s, "infra")).toBe(950936);
    expect(sub(s, "C")).toBe(1186936);
    expect(s.gst).toBeUndefined();
    expect(r(s.total)).toBe(10218451);
    expect(s.registration.map((l) => r(l.amount))).toEqual([100989, 29500]);
  });

  it("payment plan", () => {
    expect(s.schedule.map((m) => r(m.amount))).toEqual([200000, 2295613, 1615368, 2495613, 1497368, 998245, 998245, 118000]);
    expect(r(s.schedule.reduce((a, m) => a + m.amount, 0))).toBe(10218451);
  });

  it("launch price before 50 bookings", () => {
    expect(computeCostSheet(riverineLaunch, unit, { bookingsCount: 49 }).basePsf).toBe(3299);
  });

  it("missing unit attribute is an error, not a silent zero", () => {
    expect(() => computeCostSheet(riverineLaunch, { area: { plotArea: 1163 } })).toThrow(/facingPsf/);
  });
});
