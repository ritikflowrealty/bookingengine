import { CostSheetView } from "@/components/CostSheetView";
import { computeCostSheet, toCustomerView } from "@/lib/pricing/engine";
import { riverineLaunch, sipaniCityFar, sumadhuraSolea } from "@/lib/pricing/presets";

// Sample units only (the same ones as the golden tests); no real customer data.
const samples = [
  { title: "SIPANI CITY · C-2104", sheet: computeCostSheet(sipaniCityFar, { area: { sbua: 1065 }, floor: 21, tier: "Platinum", attrs: { sourcingPsf: 6930 } }) },
  { title: "SUMADHURA SOLEA · E-1207", sheet: computeCostSheet(sumadhuraSolea, { area: { sbua: 2110 }, floor: 12, attrs: { plcPsf: 0, parkingValue: 800000 } }) },
  { title: "THE RIVERINE · Plot 153", sheet: computeCostSheet(riverineLaunch, { area: { plotArea: 2377.34 }, attrs: { facingPsf: 300, parkPsf: 0, cornerPsf: 0 } }, { bookingsCount: 50 }) },
];

export default function CostSheetPreview() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Pricing engine preview</h1>
      {samples.map((s) => (
        <CostSheetView key={s.title} title={s.title} sheet={toCustomerView(s.sheet)} />
      ))}
    </main>
  );
}
