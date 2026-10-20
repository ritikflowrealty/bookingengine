// Rule-driven cost-sheet engine. A price list is pure data (stored as JSON on price_lists.config);
// this file turns (price list, unit, context) into a line-by-line cost sheet.
// Amounts are kept unrounded (as the Google Sheets do) and rounded only for display.

export type Condition = {
  tiers?: string[];
  tagsAny?: string[];
  tagsAll?: string[];
  offer?: string; // the offer selected on the quote, e.g. "no_offer"
  bookingsAtLeast?: number; // "first N bookings" pricing tiers
  bookingsBelow?: number;
  areaIn?: number[];
  minFloor?: number;
};

export type Rate =
  | number
  | { attr: string } // per-unit value from unit.attrs, e.g. sourcingPsf, plcPsf, parkingValue
  | { floorRise: { perFloor: number; fromFloor: number } };

export type ChargeRule = {
  id: string;
  label: string;
  group: string;
  basis: "psf" | "fixed";
  rate: Rate;
  multiplier?: number; // e.g. 24 months of maintenance
  taxRate?: number; // tax baked into this line, e.g. 0.18 for "+ GST" items
  gstExempt?: boolean; // excluded from the price-list GST base
  when?: Condition;
};

export type Milestone = {
  label: string;
  percent: number; // of the schedule basis
  plus?: number; // fixed amount added (negative to deduct a token already paid)
  payer?: "own" | "bank"; // pre-EMI split
  due?: string; // e.g. "or Apr'27, whichever is later"
};

export type PriceListConfig = {
  area: { field: "sbua" | "carpet" | "plotArea"; plusTerraceFraction?: number; label: string };
  groups: { id: string; subtotalLabel?: string }[];
  base: {
    label: string;
    group: string;
    rate: Rate;
    adjustments?: { label: string; delta: Rate; when?: Condition }[];
  };
  charges: ChargeRule[];
  discountGroup: string;
  gst?: { rate: number; label: string };
  // Round the GST-inclusive total down by `step` (largest `from` <= total wins); the difference
  // is shown as a negative line before discounts, like the Sipani decoder.
  rounding?: { label: string; group: string; steps: { from: number; step: number }[]; when?: Condition };
  totalLabel: string;
  registration?: ChargeRule[];
  paymentPlan?: { name: string; excludeLines?: string[]; milestones: Milestone[] };
  validityHours?: number;
};

export type UnitPricingInput = {
  area: { sbua?: number; carpet?: number; terrace?: number; plotArea?: number };
  floor?: number; // ground = 0
  tier?: string;
  tags?: string[];
  attrs?: Record<string, number>;
};

export type PricingContext = {
  bookingsCount?: number;
  offer?: string;
  discount?: { psf?: number; amount?: number; label?: string };
};

export type CostLine = { id: string; label: string; group: string; amount: number; formula: string };

export type CostSheet = {
  areaLabel: string;
  area: number;
  basePsf: number;
  lines: CostLine[];
  subtotals: { group: string; label: string; amount: number }[];
  gst?: { label: string; rate: number; amount: number };
  totalLabel: string;
  total: number;
  effectivePsf: number;
  registration: CostLine[];
  registrationTotal: number;
  schedule: { label: string; percent: number; amount: number; payer?: string; due?: string }[];
  validityHours?: number;
  internal?: { closingPsf?: number; sourcingPsf?: number; quotedPsf: number; belowClosing: boolean };
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function matches(c: Condition | undefined, unit: UnitPricingInput, ctx: PricingContext, area: number) {
  if (!c) return true;
  const tags = unit.tags ?? [];
  const n = ctx.bookingsCount ?? 0;
  return (
    (!c.tiers || (unit.tier !== undefined && c.tiers.includes(unit.tier))) &&
    (!c.tagsAny || c.tagsAny.some((t) => tags.includes(t))) &&
    (!c.tagsAll || c.tagsAll.every((t) => tags.includes(t))) &&
    (c.offer === undefined || c.offer === ctx.offer) &&
    (c.bookingsAtLeast === undefined || n >= c.bookingsAtLeast) &&
    (c.bookingsBelow === undefined || n < c.bookingsBelow) &&
    (!c.areaIn || c.areaIn.includes(area)) &&
    (c.minFloor === undefined || (unit.floor ?? 0) >= c.minFloor)
  );
}

export function resolveRate(rate: Rate, unit: UnitPricingInput): number {
  if (typeof rate === "number") return rate;
  if ("attr" in rate) {
    const v = unit.attrs?.[rate.attr];
    if (v === undefined) throw new Error(`Unit is missing pricing attribute "${rate.attr}"`);
    return v;
  }
  const { perFloor, fromFloor } = rate.floorRise;
  return Math.max(0, (unit.floor ?? 0) - fromFloor + 1) * perFloor;
}

function areaOf(cfg: PriceListConfig, unit: UnitPricingInput) {
  const a = unit.area[cfg.area.field];
  if (a === undefined) throw new Error(`Unit is missing area "${cfg.area.field}"`);
  return a + (cfg.area.plusTerraceFraction ?? 0) * (unit.area.terrace ?? 0);
}

function chargeLine(r: ChargeRule, unit: UnitPricingInput, area: number): CostLine {
  const rate = resolveRate(r.rate, unit);
  const mult = r.multiplier ?? 1;
  const tax = r.taxRate ?? 0;
  const amount = (r.basis === "psf" ? rate * area : rate) * mult * (1 + tax);
  const parts = [r.basis === "psf" ? `${num(area)} sq ft × ₹${num(rate)}` : inr(rate)];
  if (mult !== 1) parts.push(`× ${mult}`);
  if (tax) parts.push(`+ ${num(tax * 100)}% GST`);
  return { id: r.id, label: r.label, group: r.group, amount, formula: parts.join(" ") };
}

export function computeCostSheet(cfg: PriceListConfig, unit: UnitPricingInput, ctx: PricingContext = {}): CostSheet {
  const area = areaOf(cfg, unit);
  const ok = (c?: Condition) => matches(c, unit, ctx, area);

  const baseRate = resolveRate(cfg.base.rate, unit);
  const adjustments = (cfg.base.adjustments ?? []).filter((a) => ok(a.when)).map((a) => ({ label: a.label, delta: resolveRate(a.delta, unit) }));
  const basePsf = adjustments.reduce((s, a) => s + a.delta, baseRate);
  const baseFormula =
    `${num(area)} sq ft × ` +
    (adjustments.length ? `(₹${num(baseRate)} ${adjustments.map((a) => `${a.delta < 0 ? "−" : "+"} ₹${num(Math.abs(a.delta))} ${a.label}`).join(" ")})` : `₹${num(basePsf)}`);

  const lines: CostLine[] = [
    { id: "base", label: cfg.base.label, group: cfg.base.group, amount: basePsf * area, formula: baseFormula },
    ...cfg.charges.filter((r) => ok(r.when)).map((r) => chargeLine(r, unit, area)),
  ].filter((l) => l.amount !== 0);

  const gstRate = cfg.gst?.rate ?? 0;
  const exempt = new Set(cfg.charges.filter((r) => r.gstExempt).map((r) => r.id));
  const gstBase = () => lines.filter((l) => !exempt.has(l.id)).reduce((s, l) => s + l.amount, 0);
  const sum = () => lines.reduce((s, l) => s + l.amount, 0);

  if (cfg.rounding && ok(cfg.rounding.when)) {
    const pre = sum();
    const gross = pre + gstBase() * gstRate;
    const step = [...cfg.rounding.steps].sort((a, b) => b.from - a.from).find((s) => gross >= s.from)?.step ?? 1;
    const target = Math.floor(gross / step) * step;
    // Solve for the pre-GST reduction that lands the GST-inclusive total exactly on `target`.
    const adj = (gross - target) / (1 + gstRate);
    if (adj > 0) lines.push({ id: "rounding", label: cfg.rounding.label, group: cfg.rounding.group, amount: -adj, formula: `rounded down to ${inr(target)} incl. GST` });
  }

  const d = ctx.discount;
  const discount = d ? (d.psf ?? 0) * area + (d.amount ?? 0) : 0;
  if (discount > 0) {
    const f = [d?.psf ? `${num(area)} sq ft × ₹${num(d.psf)}` : "", d?.amount ? inr(d.amount) : ""].filter(Boolean).join(" + ");
    lines.push({ id: "discount", label: d?.label ?? "Discount", group: cfg.discountGroup, amount: -discount, formula: f });
  }

  const subtotals = cfg.groups
    .filter((g) => g.subtotalLabel)
    .map((g) => ({ group: g.id, label: g.subtotalLabel!, amount: lines.filter((l) => l.group === g.id).reduce((s, l) => s + l.amount, 0) }));
  const gstAmount = gstBase() * gstRate;
  const total = sum() + gstAmount;

  const registration = (cfg.registration ?? []).filter((r) => ok(r.when)).map((r) => chargeLine(r, unit, area));

  const plan = cfg.paymentPlan;
  const excluded = new Set(plan?.excludeLines ?? []);
  const basis = total - lines.filter((l) => excluded.has(l.id)).reduce((s, l) => s + l.amount, 0);
  const schedule = (plan?.milestones ?? []).map((m) => ({
    label: m.label,
    percent: m.percent,
    amount: basis * m.percent + (m.plus ?? 0),
    ...(m.payer && { payer: m.payer }),
    ...(m.due && { due: m.due }),
  }));

  const closingPsf = unit.attrs?.closingPsf;
  // Closing/sourcing PSF are comparable to the raw base rate (before tier premiums), less any discount.
  const quotedPsf = baseRate - (d?.psf ?? 0) - (d?.amount ?? 0) / area;
  return {
    areaLabel: cfg.area.label,
    area,
    basePsf,
    lines,
    subtotals,
    ...(cfg.gst && { gst: { label: cfg.gst.label, rate: gstRate, amount: gstAmount } }),
    totalLabel: cfg.totalLabel,
    total,
    effectivePsf: total / area,
    registration,
    registrationTotal: registration.reduce((s, l) => s + l.amount, 0),
    schedule,
    validityHours: cfg.validityHours,
    internal: { closingPsf, sourcingPsf: unit.attrs?.sourcingPsf, quotedPsf, belowClosing: closingPsf !== undefined && quotedPsf < closingPsf },
  };
}

/** Strip fields customers and restricted sales roles must never see (closing/sourcing PSF etc.). */
export function toCustomerView(sheet: CostSheet): Omit<CostSheet, "internal"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { internal, ...rest } = sheet;
  return rest;
}

/** Schedule milestones must add up to 100% of the basis. */
export function validatePriceList(cfg: PriceListConfig): string[] {
  const errors: string[] = [];
  const groups = new Set(cfg.groups.map((g) => g.id));
  for (const g of [cfg.base.group, cfg.discountGroup, ...cfg.charges.map((c) => c.group)]) if (!groups.has(g)) errors.push(`Unknown group "${g}"`);
  const pct = (cfg.paymentPlan?.milestones ?? []).reduce((s, m) => s + m.percent, 0);
  if (cfg.paymentPlan && Math.abs(pct - 1) > 1e-9) errors.push(`Payment plan adds up to ${num(pct * 100)}%, not 100%`);
  return errors;
}
