import { computeCostSheet, toCustomerView } from "@/lib/pricing/engine";
import { sipaniCityFar } from "@/lib/pricing/presets";
import type { CostSheetPdfInput } from "./CostSheetPdf";

/** Sipani City C-2104 sample (same unit as the golden tests), fictional customer. */
export function sampleCostSheetPdfInput(generatedAt = new Date()): CostSheetPdfInput {
  const sheet = computeCostSheet(sipaniCityFar, { area: { sbua: 1065 }, floor: 21, tier: "Platinum", attrs: { sourcingPsf: 6930 } });
  return {
    sheet: toCustomerView(sheet),
    project: { name: "Sipani City", developerName: "Sipani", reraNumbers: ["PRM/KA/RERA/1251/308/PR/171025/008179"], accentColor: "#C2276F", city: "Bengaluru" },
    unit: { number: "C-2104", typeLabel: "2 BHK", towerName: "Tower C", floorLabel: "21st floor", facing: "East", kind: "apartment" },
    customerName: "Demo Customer",
    preparedBy: "Demo Sales Manager",
    generatedAt,
    validUntil: new Date(generatedAt.getTime() + 24 * 3_600_000),
    terms: [
      "Stamp duty, registration charges and khata transfer are extra, as applicable at the time of registration.",
      "GST and other statutory levies are charged at prevailing rates; any change is passed on to the buyer.",
      "Cheques / transfers in favour of the developer's RERA collection account only.",
    ],
  };
}
