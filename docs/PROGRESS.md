# Progress

Read this, `DECISIONS.md` and `git log` at the start of every session; continue from the first unchecked item.

**Preview:** every push to `ccr-a34cbb36-8q9v2k` deploys to https://bookingengine-git-ccr-a34cbb36-8q9v2k-ritikflowrealty.vercel.app (behind Vercel login). Production = `main`, only on Ritik's go-ahead.
Without `DATABASE_URL` the app runs in **demo mode** (seeded in-memory Postgres). Demo logins: `admin@ / leadership@ / teamlead@ / sales@ / presales@flowrealty.in`, password `flow@1234`; customer OTP is shown on screen; kiosk exit PIN `2468`.

## Previews
After every visible change: `npm run dev`, then `node scripts/screenshots.mjs <dir> http://localhost:3000 [paths…]` (set `LOGIN_EMAIL=…` to log in first; append `#click=<selector>` to a path to click before the shot) and send the PNGs to Ritik.
Full flow smoke test: `node scripts/e2e-booking.mjs <dir> http://localhost:3000 <project-slug> <width>` (OTP → pick → reserve → demo pay → form → KYC → staff verifies and confirms).

## Done
- [x] Foundations: Next.js 15 + TS + Tailwind v4, brand design system (`src/components/ui.tsx`), Vitest, ESLint, docs
- [x] Data model (Drizzle) + migration; DB layer: Neon (WebSocket pool, transactions) or seeded PGlite demo
- [x] Pricing engine + presets (Sipani FAR, Solea, Riverine) with golden tests to the rupee
- [x] Permissions (roles, scopes, discount approval routing), booking state machine, unit generator — all tested
- [x] Staff auth (email + password, httpOnly session cookies), app shell (sidebar / phone bottom nav), dashboard
- [x] Live inventory: tower grid, **3D towers** (`src/components/three/TowerScene.tsx`), **master plan** (`src/components/plan/MasterPlan.tsx`), filters, 5 s polling
- [x] Unit panel: facts, live cost sheet, internal closing/sourcing PSF (gated), hold / release / extend / request extension / block / unblock (row-locked), discount with approval routing, "No offer" toggle, share link + WhatsApp share, branded PDF
- [x] Approvals inbox (discount, hold extension, cancellation)
- [x] Bookings: list, detail with timeline, frozen cost sheet, offline token recording, KYC verification (signed links), confirm → agreement → registered, cancellation (approval after token), history
- [x] Customer self-booking `/p/<slug>/book`: WhatsApp OTP (rate limits, 5-min expiry, 5-try lockout), lead lookup, live picker (3D / floors / master plan / list), customer-safe quote, checkout hold, PayU (hash + verified server callback; simulated gateway in demo), booking form, KYC upload, resume via OTP
- [x] Kiosk `/kiosk/<slug>`: big touch UI, full-screen, 2-min idle reset with data clear, back-button block, staff PIN exit
- [x] Share page `/s/<token>` + PDF; landing page with Book now links
- [x] Notifications queue (`sync_jobs`) + worker with backoff; WhatsApp adapters (DoubleTick, Gallabox); Totality mappers; cron route
- [x] Admin area `/app/admin` (super admin): projects + integrations (env-var names only) + discount limits, tower/series structure → unit generation (creates missing only), bulk unit editor + CSV/XLSX export + import with diff preview (accepts developer sheet headers), price-list versions (duplicate / activate / archive) with structured editor, JSON tab and live cost-sheet preview, users + reporting tree, audit log with before/after diff

## Next
- [ ] Connect Neon (`DATABASE_URL`) and set `ADMIN_EMAIL` / `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, `APP_URL` in Vercel; run `npm run db:migrate`
- [ ] PayU test keys per project → test a real sandbox payment end to end
- [ ] WhatsApp: create/approve the Authentication (OTP) and Utility templates on DoubleTick/Gallabox, set template env names, test real sends; SMS fallback provider
- [ ] Totality: get the API reference per site, wire lead pull/refresh, booking push and lead creation (mappers exist)
- [ ] Import the remaining sheets: Sipani Phase 1 + Window 2, Epitome, Pramoda, UKn Phase 2, Geown, Riverine Launch/Oct price sheets + PDF
- [ ] Integrate the website's booking-form module (when shared) and the website "Book now" deep link (`/p/<slug>/book`)
- [ ] Reports (team, project, discounts, holds); optional dark theme; channel-partner role
- [ ] Security review + load test of hold/booking races on Neon; production deploy on your go-ahead

## Blockers / questions for Ritik
1. Sections 9–12 of the brief were cut off; please resend.
2. Riverine east-facing premium: ₹300 (sheet) or ₹250 (T&C)? Currently per-plot values from the sheet (₹300).
3. Neon: add it from Vercel → Storage on the bookingengine project (or give the Vercel connector access to the `ritikflowrealty` team).
4. PayU test merchant key + salt; WhatsApp template names; Totality API docs; the website booking-form module.
