# Flow Inventory: architecture

## Stack
- **Next.js 15** (App Router, TypeScript, React 19) on **Vercel**; Tailwind CSS v4.
- **PostgreSQL on Neon** (Vercel Marketplace) via **Drizzle ORM**. Migrations in `drizzle/`, generated with `npm run db:generate`.
- **Vitest** for unit tests (`npm test`); ESLint (`npm run lint`); `npm run typecheck`.
- Later phases: Vercel Blob (private) for KYC/PDFs, `@react-three/fiber` + `drei` for 3D, `@react-pdf/renderer` for cost-sheet PDFs, Vercel Cron for jobs.

## Folder layout
```
src/
  app/                 routes (staff app, /p/<slug>/book customer flow, /kiosk, /api/*)
  components/          shared UI (CostSheetView, …)
  db/schema.ts         the whole data model
  db/index.ts          Drizzle client
  lib/pricing/         engine.ts (rules → cost sheet), presets.ts (price lists transcribed from the sheets)
  lib/auth/            permissions.ts (roles, scopes, discount approval routing)
  lib/booking/         state.ts (booking state machine, unit status mapping)
  lib/integrations/    totality/, whatsapp/, payu/ (later phases)
drizzle/               SQL migrations
docs/                  ARCHITECTURE, DECISIONS, PROGRESS, PRICING
```

## Data model
See `src/db/schema.ts`; the brief's section 5, with these refinements:
- **Plots are units** (`units.kind = 'plot'`) with plot columns (`plot_area_sqm/sqft`, `plan` X%/Y% or polygon, `details` for shape/segment/avenue). New types (villa, row house, commercial) are new enum values, not new tables.
- **Per-unit pricing inputs** live in `units.price_attrs` (jsonb: `sourcingPsf`, `closingPsf`, `plcPsf`, `parkingValue`, `facingPsf`…). Price-list rules reference them by name (`{ attr: "sourcingPsf" }`). This is how unit overrides work. `units.tags` drives conditional premiums (east, corner, park, river…).
- **Price lists** are versioned rows; rules, offers and the payment plan are one JSON `config` (`PriceListConfig`), validated by `validatePriceList`. A booking stores the whole computed `CostSheet` (frozen snapshot) plus the price-list id, so activating a new list never changes old bookings.
- **Integrations store env-var names, never secrets** (`projects.totality_env_key`, `wa_env_key`, `payu_env_key`).
- Money and areas are `numeric` in Postgres. The engine keeps amounts unrounded and rounds only for display, like the sheets.

## Pricing engine (`src/lib/pricing/engine.ts`)
`computeCostSheet(priceList, unit, { bookingsCount, offer, discount })` → `CostSheet`:
1. Chargeable area = `area.field` (+ terrace × fraction, e.g. Sipani 1/3).
2. Base PSF = base rate (constant or per-unit attr) + matching adjustments (tier premium, "after first N bookings", "no offer").
3. Charge lines: `psf` or `fixed`, constant / per-unit attr / floor-rise rate, optional multiplier (months) and baked-in tax (e.g. clubhouse + 18%), optional condition.
4. Optional rounding (floor GST-inclusive total to ₹1,000 / ₹1 L) shown as its own line, then discount (PSF and/or lump sum).
5. Group subtotals (A, B, C…), GST on the non-exempt lines, grand total, effective PSF.
6. Registration-time charges, payment schedule (percent of total minus excluded lines + fixed amounts).
7. `internal` block (closing/sourcing PSF, below-closing flag) is removed by `toCustomerView()` for customers and roles without `inventory.view_internal`.

Golden tests (`engine.test.ts`) reproduce the Sipani FAR, Solea and Riverine sheets to the rupee. Details: `docs/PRICING.md`.

## Auth and permissions
- Staff: email + password (argon2/scrypt hash), optional OTP; customers: phone + WhatsApp OTP (6 digits, 5 min, 5 tries, rate-limited). Sessions are random tokens in httpOnly, Secure, SameSite=Lax cookies; DB stores the sha256 (`sessions`).
- `can(actor, action, scope)` / `assertCan` in every server action and API route. Scope = assigned projects, all projects, or the developer for developer users.
- Discount approval routes up the reporting tree (`users.manager_id`) to the first manager whose per-project limit covers it (`discountApprover`).

## Concurrency (no double booking)
- Hold/book runs in one transaction: `SELECT … FROM units WHERE id = $1 FOR UPDATE`, check `status = 'available'`, update status + `version + 1`.
- A partial unique index allows only one live booking per unit (`bookings_one_live_per_unit`), so even a bug in app code cannot double book.
- Hold expiry: Vercel Cron every minute releases units with `hold_expires_at < now()`; reads also treat expired holds as available.

## Sync and jobs
- `sync_jobs` is a Postgres queue (status, attempts, `run_after` with exponential backoff); a cron route claims due jobs with `FOR UPDATE SKIP LOCKED`. Every request/response goes to `sync_log`.
- Totality: pull leads on a schedule + live refresh on customer login if older than a few minutes; push booking/status changes as jobs.
- WhatsApp: provider adapter per project (DoubleTick / Gallabox), Authentication template for OTP, Utility templates for confirmations.
- PayU: payment success is accepted only from the server-to-server callback with a verified reverse hash.

## Realtime
Inventory screens poll a lightweight `/api/projects/<id>/inventory?since=<version>` every 5 s (cheap on Vercel, works through kiosk networks). SSE can replace it later without UI changes.

## Audit
Every mutation writes `audit_log` (actor, action, entity, before, after) in the same transaction.
