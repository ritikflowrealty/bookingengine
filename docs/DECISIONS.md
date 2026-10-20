# Decisions

Defaults chosen without asking. Change any of them by editing this file and the code together.

1. **Stack as recommended**: Next.js 15 + TypeScript + Tailwind v4, Neon Postgres, **Drizzle** (lighter than Prisma on serverless, SQL-first so `FOR UPDATE` is natural), Vitest.
2. **Brief was cut off** after section 8 ("DXF import as a…"). Sections 9–12 (Totality sync detail, PayU, reports, the phase list) were not received. Phases in `PROGRESS.md` are my own ordering until the rest arrives.
3. **Plots are units** (`kind = 'plot'`) rather than a separate `plots` table, so holds, bookings, pricing and status logic are written once.
4. **Offers and payment plans live inside the price-list JSON** instead of separate `offers` / `price_rules` / `payment_plans` tables. A price list (with its offers and plan) is one versioned, freezable unit; the admin UI edits it as a form. Can be normalised later if reporting needs it.
5. **Per-unit prices are attributes** (`price_attrs`), e.g. Sipani's per-unit Sourcing PSF (the quoted base) and Closing PSF (internal floor).
6. **Sipani quotes off Sourcing PSF**: the Cost Sheet tab looks up Inventory column U (Sourcing), not T (Closing). The brief calls closing "internal floor price" and sourcing "quoted price"; the engine flags a quote as below closing when `sourcing − discount < closing`, which will trigger approval.
7. **Sipani rounding**: the sheet rounds the GST-inclusive total down to ₹1,000 (₹1 L at ₹1 Cr or more) only for the four decoder sizes (1065/1280/1450/1660 sq ft). We show it as a separate "Rounding adjustment" line; the sheet folds it into "Basic Flat Cost". Totals match to the rupee. For units with a terrace, the sheet computes rounding on SBUA without the terrace third; we use the chargeable area (the sheet is likely inconsistent there).
8. **Discount is applied after rounding**, like the sheet, so a discounted total is not a round number.
9. **Riverine premiums come from per-plot values** (Area statement: facing/park/corner PSF), which is what the NR Cost sheet uses (East = ₹300). The T&C text says ₹250 — **awaiting your confirmation** (see PROGRESS blockers).
10. **Riverine infrastructure is ₹400 PSF flat incl. GST**, as in the sheet (₹340 × 1.18 would be ₹401.20).
11. **Zero-amount lines are hidden** on cost sheets (e.g. PLC 0).
12. **Line amounts stay unrounded; display rounds to the rupee**, matching how the sheets compute totals.
13. **Realtime by polling (5 s)** first; SSE later if needed.
14. **Solea schedule**: the sheet's amount column is broken (references an empty cell, shows 0); we compute milestones from Total (B).
15. **Riverine base**: launch config is ₹3,299 → ₹3,499 from the 51st booking (brief). The NR Cost sheet tab currently shows ₹3,499 labelled "Pre-launch (1st 50 families)"; golden test uses 50 bookings to get ₹3,499.
