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
16. **Demo mode**: with no `DATABASE_URL`, the app boots an in-process Postgres (PGlite), runs the migrations and seeds sample projects (real Sipani/Solea unit structures and the real Riverine plot layout from the sheets, fictitious people). Data resets on every cold start. Set `DATABASE_URL` (Neon) to switch to the real database; nothing else changes.
17. **"First N bookings"** counts units already booked or sold in the project (`bookedCount`), so the seeded Riverine (211 sold) prices at ₹3,499 like the current sheet.
18. **KYC files are stored in Postgres** (`kyc_documents.content`, ≤5 MB, JPG/PNG/WebP/PDF), served only by `/api/kyc/<id>` with a 5-minute HMAC-signed link *and* a role/ownership check. Private by construction; move to private object storage if volume grows.
19. **Vercel Hobby crons run once a day**, so hold expiry and the sync queue also run opportunistically from live inventory requests (at most every 30 s per instance), and every read treats an expired hold as available.
20. **Discount approvals**: a discount above the user's limit needs an approval for that user + unit; quotes, share links, PDFs and staff bookings all re-check it server-side (`discountNeedsApproval`).
21. **One online checkout per customer per project** at a time, so nobody can tie up several units with short holds.
22. **Staff booking hold** is 24 h (token often collected offline); customer checkout hold is the project's `checkout_hold_minutes` (default 15).
23. **Unassigned bookings** (customer with no Totality lead) are visible to team leads and leadership, not to individual sales managers, until a lead is linked.
24. **Totality**: lead/booking mappers are written and tested, but the HTTP calls wait for Totality's API reference; jobs stay queued with retries and a clear error.
25. **PDF fonts**: Helvetica plus bundled DejaVu Sans (permissive licence, `public/fonts/LICENSE-DejaVu.txt`) for the ₹ and − glyphs.
