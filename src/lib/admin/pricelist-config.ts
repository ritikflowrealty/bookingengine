// Price-list config validation and defaults. Client-safe: the editor runs the same checks live.
import { z } from "zod";
import { validatePriceList, type PriceListConfig } from "@/lib/pricing/engine";
import { userError } from "./errors";

const label = z.string().trim().min(1).max(300);
const rate = z.union([z.number().finite(), z.object({ attr: z.string().trim().min(1) }).strict(), z.object({ floorRise: z.object({ perFloor: z.number().finite(), fromFloor: z.number().int() }).strict() }).strict()]);
const strs = z.array(z.string().trim().min(1)).optional();
const condition = z
  .object({ tiers: strs, tagsAny: strs, tagsAll: strs, offer: z.string().trim().min(1).optional(), bookingsAtLeast: z.number().int().min(0).optional(), bookingsBelow: z.number().int().min(0).optional(), areaIn: z.array(z.number().positive()).optional(), minFloor: z.number().int().optional() })
  .strict();
const charge = z
  .object({ id: z.string().trim().regex(/^[a-z0-9_-]+$/i, "Use letters, digits, - or _"), label, group: z.string().min(1), basis: z.enum(["psf", "fixed"]), rate, multiplier: z.number().positive().optional(), taxRate: z.number().min(0).max(1).optional(), gstExempt: z.boolean().optional(), when: condition.optional() })
  .strict();

export const priceListConfigSchema = z
  .object({
    area: z.object({ field: z.enum(["sbua", "carpet", "plotArea"]), plusTerraceFraction: z.number().min(0).max(1).optional(), label }).strict(),
    groups: z.array(z.object({ id: z.string().trim().min(1).max(20), subtotalLabel: z.string().trim().min(1).optional() }).strict()).min(1),
    base: z.object({ label, group: z.string().min(1), rate, adjustments: z.array(z.object({ label, delta: rate, when: condition.optional() }).strict()).optional() }).strict(),
    charges: z.array(charge),
    discountGroup: z.string().min(1),
    gst: z.object({ rate: z.number().min(0).max(1), label }).strict().optional(),
    rounding: z.object({ label, group: z.string().min(1), steps: z.array(z.object({ from: z.number().min(0), step: z.number().positive() }).strict()).min(1), when: condition.optional() }).strict().optional(),
    totalLabel: label,
    registration: z.array(charge).optional(),
    paymentPlan: z
      .object({
        name: label,
        excludeLines: z.array(z.string()).optional(),
        milestones: z.array(z.object({ label, percent: z.number().min(0).max(1), plus: z.number().finite().optional(), payer: z.enum(["own", "bank"]).optional(), due: z.string().trim().optional() }).strict()).min(1),
      })
      .strict()
      .optional(),
    validityHours: z.number().int().positive().max(24 * 90).optional(),
  })
  .strict();

/** Engine checks plus things the form can get wrong: duplicate line ids, rounding into an unknown group. Client-safe. */
export function configErrors(cfg: PriceListConfig): string[] {
  const errors = validatePriceList(cfg);
  const ids = [...cfg.charges, ...(cfg.registration ?? [])].map((c) => c.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) errors.push(`Charge ids must be unique: ${[...new Set(dup)].join(", ")}`);
  if (ids.includes("base") || ids.includes("rounding") || ids.includes("discount")) errors.push(`"base", "rounding" and "discount" are reserved ids`);
  if (cfg.rounding && !cfg.groups.some((g) => g.id === cfg.rounding!.group)) errors.push(`Unknown group "${cfg.rounding.group}" in rounding`);
  return errors;
}

export function parseConfig(input: unknown): PriceListConfig {
  const cfg = priceListConfigSchema.parse(input) as PriceListConfig;
  const errors = configErrors(cfg);
  if (errors.length) throw userError(errors.join("; "));
  return cfg;
}

export function blankConfig(type: string, gstRate: number): PriceListConfig {
  const plotted = type === "plotted";
  return {
    area: { field: plotted ? "plotArea" : "sbua", label: plotted ? "Plot area (sq ft)" : "SBUA (sq ft)" },
    groups: [{ id: "A", subtotalLabel: "Total basic cost (A)" }],
    base: { label: plotted ? "Plot basic cost" : "Basic flat cost", group: "A", rate: 0, adjustments: [] },
    charges: [],
    discountGroup: "A",
    ...(gstRate > 0 && { gst: { rate: gstRate, label: `GST at ${+(gstRate * 100).toFixed(2)}%` } }),
    totalLabel: "Total cost",
    paymentPlan: { name: "Payment plan", milestones: [{ label: "On booking", percent: 1 }] },
    validityHours: 24,
  };
}
