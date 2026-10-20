# Pricing: how each sheet maps to the engine

Golden tests: `src/lib/pricing/engine.test.ts`. Presets: `src/lib/pricing/presets.ts`.

## Sipani City FAR units (sheet `1jLpE-…`, tabs Cost Sheet, Price Logic, Inventory, Decoder for Window 1)
| Sheet cell | Formula | Engine |
|---|---|---|
| B18 | SBUA + terrace/3 | `area: { field: "sbua", plusTerraceFraction: 1/3 }` |
| B19 | Inventory!U (Sourcing) − 150 if "No Offer" | `base.rate = { attr: "sourcingPsf" }`, adjustment `when: { offer: "no_offer" }` |
| B20 | +150 if Platinum (East) | adjustment `when: { tiers: ["Platinum"] }` |
| B21 | discount PSF | `ctx.discount.psf` |
| B22 | decoder rounding (floor incl.-GST total to ₹1,000 / ₹1 L ≥ ₹1 Cr) for 1065/1280/1450/1660 sq ft | `rounding` |
| B24–B26 | infra 250 PSF, parking ₹3 L, BESCOM/BWSSB 300 PSF | `charges` |
| B28 | GST 5% of A | `gst` |
| B34 | maintenance 4 × 12 × area × 1.18 | `registration` |
| B37–B53 | CLP, % of B; ground slab +₹1 L | `paymentPlan` |
Checked: C-2104 (₹88,47,000), decoder 2BHK Diamond (₹85.56 L) and 2BHK Luxe Platinum (₹1.05 Cr).

## Sumadhura Solea (sheet `1jFjRYAg…`, tabs Cost Sheet, Inventory)
Base ₹12,350 (+₹250 after 20 bookings), club ₹3.5 L, utilities 375 PSF, floor rise (floor − 2) × ₹30 PSF, PLC per unit (Inventory col Q), car park value per unit (col X), GST 5% on everything, maintenance 120 PSF × 1.18. Checked: E-1207 (₹3,00,64,388).

## The Riverine (sheet `1eHYI4kr…`, tabs NR Cost sheet, NR Inventory, Area statement)
Plot area unrounded sq ft; base ₹3,299 → ₹3,499 after 50; facing/park/corner PSF per plot; clubhouse ₹2 L + 18%; infra ₹400 PSF incl. GST; no GST line. Registration: maintenance 1.5 × 24 × area × 1.18, legal ₹25,000 × 1.18. Plan: % of (total − clubhouse) with token ₹2 L and clubhouse ₹1.18 L twice. Checked: plot 153 (₹1,02,18,451).
