import type { PriceListConfig } from "./engine";

// Price lists transcribed from the reference Google Sheets (see docs/PRICING.md for cell references).
// These seed the database; once seeded, admins edit them as versioned price lists.

const sipaniSlabs = [2, 4, 6, 8, 10, 12, 14, 16, 18].map((f) => ({ label: `Commencement of ${f}${f === 2 ? "nd" : "th"} floor slab`, percent: 0.05 }));

export const sipaniCityFar: PriceListConfig = {
  area: { field: "sbua", plusTerraceFraction: 1 / 3, label: "Total SBUA (sq ft)" },
  groups: [{ id: "A", subtotalLabel: "Net Basic Cost (A)" }],
  base: {
    label: "Basic flat cost",
    group: "A",
    rate: { attr: "sourcingPsf" }, // the quoted per-unit PSF lives in the inventory
    adjustments: [
      { label: "Platinum band premium", delta: 150, when: { tiers: ["Platinum"] } },
      { label: "No-offer reduction", delta: -150, when: { offer: "no_offer" } },
    ],
  },
  charges: [
    { id: "infra", label: "Infrastructure charges @ ₹250 PSF", group: "A", basis: "psf", rate: 250 },
    { id: "parking", label: "Parking charges", group: "A", basis: "fixed", rate: 300000 },
    { id: "bescom", label: "BESCOM, BWSSB & other charges", group: "A", basis: "psf", rate: 300 },
  ],
  discountGroup: "A",
  gst: { rate: 0.05, label: "GST at 5%" },
  rounding: {
    label: "Rounding adjustment",
    group: "A",
    steps: [
      { from: 0, step: 1000 },
      { from: 1e7, step: 1e5 },
    ],
    when: { areaIn: [1065, 1280, 1450, 1660] }, // sizes listed on the Window 1 decoder
  },
  totalLabel: "Total Flat Cost (B = A + GST)",
  registration: [{ id: "maintenance", label: "Maintenance for 1 year at ₹4 PSF", group: "reg", basis: "psf", rate: 4, multiplier: 12, taxRate: 0.18 }],
  paymentPlan: {
    name: "Construction linked",
    milestones: [
      { label: "Towards booking & agreement", percent: 0.1 },
      { label: "Towards excavation", percent: 0.1 },
      { label: "Commencement of foundation", percent: 0.1 },
      { label: "Commencement of basement", percent: 0.1 },
      { label: "Commencement of stilt / ground slab + 50% of Sports Club membership", percent: 0.05, plus: 100000 },
      ...sipaniSlabs,
      { label: "Commencement of internal plastering", percent: 0.025 },
      { label: "Commencement of flooring", percent: 0.025 },
      { label: "Intimation for registration / possession", percent: 0.05 },
    ],
  },
  validityHours: 24,
};

const soleaMilestones: [string, number][] = [
  ["On booking (towards agreement execution)", 0.1],
  ["Within 30 days from booking", 0.1],
  ["On completion of excavation until 1st basement or Apr'25 (WIL)", 0.05],
  ["On completion of excavation until 3rd basement or Jul'25 (WIL)", 0.05],
  ["On completion of foundation or Sep'25 (WIL)", 0.05],
  ["On completion of basement-3 floor roof slab or Dec'25 (WIL)", 0.05],
  ["On completion of basement-1 floor roof slab or Apr'26 (WIL)", 0.05],
  ["On completion of 1st floor roof slab or Jun'26 (WIL)", 0.05],
  ["On completion of 4th floor roof slab or Aug'26 (WIL)", 0.05],
  ["On completion of 8th floor roof slab or Oct'26 (WIL)", 0.05],
  ["On completion of 12th floor roof slab or Dec'26 (WIL)", 0.05],
  ["On completion of 16th floor roof slab or Feb'27 (WIL)", 0.05],
  ["On completion of 20th floor roof slab or Apr'27 (WIL)", 0.05],
  ["On completion of 24th floor roof slab or Jun'27 (WIL)", 0.05],
  ["On completion of 28th floor roof slab or Aug'27 (WIL)", 0.05],
  ["On completion of flooring of respective flat or Nov'27 (WIL)", 0.05],
  ["On completion of internal 1st coat painting or Feb'28 (WIL)", 0.05],
  ["Against registration of respective flat", 0.05],
];

export const sumadhuraSolea: PriceListConfig = {
  area: { field: "sbua", label: "SBUA (sq ft)" },
  groups: [{ id: "A", subtotalLabel: "Basic Flat Cost (A)" }],
  base: { label: "Basic flat cost", group: "A", rate: 12350, adjustments: [{ label: "after first 20 bookings", delta: 250, when: { bookingsAtLeast: 20 } }] },
  charges: [
    { id: "club", label: "Club house", group: "A", basis: "fixed", rate: 350000 },
    { id: "utilities", label: "Electricity / STP / WTP / DG at ₹375 PSF", group: "A", basis: "psf", rate: 375 },
    { id: "floor_rise", label: "Floor rise from 3rd floor (₹30 PSF per floor)", group: "A", basis: "psf", rate: { floorRise: { perFloor: 30, fromFloor: 3 } } },
    { id: "plc", label: "PLC", group: "A", basis: "psf", rate: { attr: "plcPsf" } },
    { id: "parking", label: "Car parking", group: "A", basis: "fixed", rate: { attr: "parkingValue" } },
  ],
  discountGroup: "A",
  gst: { rate: 0.05, label: "GST at 5%" },
  totalLabel: "Total Flat Cost (B)",
  registration: [{ id: "maintenance", label: "Maintenance for 2 years at ₹60 PSF per year", group: "reg", basis: "psf", rate: 120, taxRate: 0.18 }],
  paymentPlan: { name: "Construction linked", milestones: soleaMilestones.map(([label, percent]) => ({ label, percent })) },
  validityHours: 24,
};

export const riverineLaunch: PriceListConfig = {
  area: { field: "plotArea", label: "Plot area (sq ft)" },
  groups: [
    { id: "A", subtotalLabel: "Total Basic Cost (A)" },
    { id: "B", subtotalLabel: "Total PLC Cost (B)" },
    { id: "C", subtotalLabel: "Total Other Charges (C)" },
  ],
  base: { label: "Plot basic cost", group: "A", rate: 3299, adjustments: [{ label: "after first 50 families", delta: 200, when: { bookingsAtLeast: 50 } }] },
  charges: [
    { id: "facing", label: "Facing premium", group: "B", basis: "psf", rate: { attr: "facingPsf" } },
    { id: "park", label: "Park / clubhouse / promenade premium", group: "B", basis: "psf", rate: { attr: "parkPsf" } },
    { id: "corner", label: "Corner plot premium", group: "B", basis: "psf", rate: { attr: "cornerPsf" } },
    { id: "club", label: "Clubhouse charges (incl. GST)", group: "C", basis: "fixed", rate: 200000, taxRate: 0.18 },
    { id: "infra", label: "Infrastructure & development @ ₹400 PSF (incl. GST)", group: "C", basis: "psf", rate: 400 },
  ],
  discountGroup: "A",
  totalLabel: "Sale consideration (incl. GST, excl. maintenance & legal)",
  registration: [
    { id: "maintenance", label: "Advance maintenance @ ₹1.5 PSF + GST for 2 years", group: "reg", basis: "psf", rate: 1.5, multiplier: 24, taxRate: 0.18 },
    { id: "legal", label: "Legal expense reimbursement", group: "reg", basis: "fixed", rate: 25000, taxRate: 0.18 },
  ],
  paymentPlan: {
    name: "Plot payment plan",
    excludeLines: ["club"], // clubhouse is collected as the fixed amounts below
    milestones: [
      { label: "Token amount", percent: 0, plus: 200000 },
      { label: "Within 15 days of booking: 25% less token, with sale agreement", percent: 0.25, plus: -200000 },
      { label: "Within 45 days of booking: 40% less amount paid + ₹1,00,000 + GST towards clubhouse", percent: 0.15, plus: 118000 },
      { label: "On completion of ground formation of plots", percent: 0.25 },
      { label: "On completion of underground services", percent: 0.15 },
      { label: "On completion of road works", percent: 0.1 },
      { label: "On final payment request letter", percent: 0.1 },
      { label: "Balance clubhouse charges, on final payment request letter", percent: 0, plus: 118000 },
    ],
  },
  validityHours: 24,
};
