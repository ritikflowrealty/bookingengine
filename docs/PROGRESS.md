# Progress

Read this, `DECISIONS.md` and `git log` at the start of every session; continue from the first unchecked item.

## Phase 0: foundations ✅
- [x] Next.js + TS + Tailwind scaffold, brand tokens (palette, Outfit/Work Sans, status colours), Vitest, ESLint
- [x] `docs/ARCHITECTURE.md`, `DECISIONS.md`, `PRICING.md`, `.env.example`
- [x] Drizzle schema for the full data model + initial migration (`drizzle/0000_init.sql`)
- [x] Pricing engine + presets for Sipani City FAR, Sumadhura Solea, The Riverine; golden tests to the rupee
- [x] Permissions (roles, scopes, discount approval routing) + tests
- [x] Booking state machine + unit status mapping + tests
- [x] `/preview/cost-sheet` page rendering the three sample cost sheets

## Phase 1: database, auth, admin basics
- [x] Vercel project connected (production = `main`; every push to `ccr-a34cbb36-8q9v2k` gets a preview at https://bookingengine-git-ccr-a34cbb36-8q9v2k-ritikflowrealty.vercel.app, behind Vercel login)
- [ ] Provision Neon via Vercel Marketplace (Vercel connector still lacks access to the `ritikflowrealty` team: 403)
- [ ] Switch `src/db/index.ts` to the WebSocket Pool driver (transactions); run migrations in CI/deploy
- [ ] Staff auth: email + password, session cookies, optional email/WhatsApp OTP; middleware guards
- [ ] Users + reporting tree + project assignment admin; audit-log helper used by every mutation
- [ ] Developers / projects / phases admin (accent colour, logo, RERA, integration env-key names, hold hours, token, GST)
- [ ] Seed script (developers, projects, price lists from presets; no real customer data)

## Phase 2: inventory
- [ ] Tower + series structure → unit generation (`{tower}-{floor}{series:02}` formats, G floor, basements)
- [ ] Spreadsheet-style bulk edit grid; CSV/XLSX import/export (incl. Sipani/Solea/Riverine inventory tabs)
- [ ] Block/release (landowner, management, developer), FAR flags
- [ ] Live inventory grid by tower/floor with status colours + legend; 5 s polling
- [ ] Hold / release / extend (row lock + version), hold countdown, expiry cron, extension approvals

## Phase 3: price lists and cost sheets
- [ ] Price-list admin (draft → active → archived, versions, validity dates), import presets for Epitome, Pramoda, UKn Phase 2, Geown
- [ ] Cost sheet screen for staff (internal fields gated), discount entry + approval routing
- [ ] PDF generation (Flow + project branding, RERA, validity, disclaimers) and share link / WhatsApp share

## Phase 4: customer self-booking
- [ ] WhatsApp OTP login (DoubleTick / Gallabox Authentication templates, SMS fallback), rate limits, lockout
- [ ] Lead lookup (cached `leads`, live refresh), customer-safe profile
- [ ] Unit picker (tower → floor → unit; plotted map → plot), checkout hold (15 min)
- [ ] PayU token payment (test mode) with server-to-server hash verification
- [ ] Booking form (integrate existing website module) + KYC uploads to private Blob with signed URLs
- [ ] Kiosk mode (fullscreen, idle 2 min logout + data clear, staff PIN exit)

## Phase 5: 3D towers and master-plan map
- [ ] Auto-generated 3D towers from structure (project name + tower label), status-coloured units
- [ ] Plotted master plan: image + X%/Y% markers or polygons, import from Riverine "Plot Locations"

## Phase 6: Totality + WhatsApp sync
- [ ] Totality adapters per project site (env-key credentials), lead pull, booking push, lead creation for walk-ins
- [ ] Queue worker with retries + sync log UI
- [ ] WhatsApp Utility notifications (booking confirmation, SM/TL alerts)

## Phase 7: reports, hardening, launch
- [ ] Reports (team, project, discount, holds), audit-log viewer
- [ ] Security review, load test of hold/booking races, production deploy (on your go-ahead)

## Previews
After every visible change: `npm run dev`, then `node scripts/screenshots.mjs <dir> http://localhost:3000 [paths…]` (phone 390 px + desktop 1440 px) and send the PNGs to Ritik.

## Blockers / questions for you
1. **The brief was cut off** mid-section 8 ("DXF import as a…"); sections 9–12 did not arrive. Please resend them.
2. **Riverine East-facing premium**: ₹300 (launch sheet, Area statement) or ₹250 (T&C text)?
3. **Neon**: add it from the Vercel Marketplace (Storage → Neon) on the bookingengine project, or grant the Vercel connector team access so Claude can.
4. Booking form module from the website: please share it.

## Session log
- 2026-10-20: Phase 0 complete. Read Sipani FAR (Cost Sheet, Price Logic, Inventory, Decoder), Solea (Cost Sheet, Inventory) and Riverine (NR Cost sheet, NR Inventory) formulas. Not yet read: Sipani Phase 1 sheet, Window 2 cost sheet, Epitome, Pramoda, UKn, Riverine Launch/Oct price sheets, the Riverine PDF.
