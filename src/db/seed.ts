import { sql } from "drizzle-orm";
import type { DB } from "./index";
import * as s from "./schema";
import { generateUnits, type SeriesSpec } from "@/lib/inventory/generate";
import { riverineLaunch, sipaniCityFar, sumadhuraSolea } from "@/lib/pricing/presets";
import { hashPassword } from "@/lib/auth/password";
import plots from "./seed-data/riverine-plots.json";

// Sample data only: unit structures and prices mirror the reference sheets; people and phone numbers are fictitious.
export const DEMO_PASSWORD = "flow@1234";
export const DEMO_KIOSK_PIN = "2468";

const sipaniSeries: SeriesSpec[] = [
  { series: 1, bhk: "2BHK", typeLabel: "2BHK", description: "2 BED + 2 TOI (2BHK)", direction: "West", view: "Courtyard", tier: "Diamond", carpet: 701, balcony: 86, sbua: 1065, uds: 334, priceAttrs: { sourcingPsf: 6820, closingPsf: 6720 } },
  { series: 2, bhk: "2BHK", typeLabel: "2BHK", description: "2 BED + 2 TOI (2BHK)", direction: "West", view: "City", tier: "Diamond", carpet: 708, balcony: 95, sbua: 1095, uds: 344, priceAttrs: { sourcingPsf: 6820, closingPsf: 6720 } },
  { series: 3, bhk: "2.5BHK", typeLabel: "2BHK Luxe", description: "3 BED + 2 TOI (2.5BHK)", direction: "East", view: "City", tier: "Platinum", carpet: 845, balcony: 90, sbua: 1280, uds: 402, tags: ["east"], priceAttrs: { sourcingPsf: 6930, closingPsf: 6830 } },
  { series: 4, bhk: "2BHK", typeLabel: "2BHK", description: "2 BED + 2 TOI (2BHK)", direction: "East", view: "City", tier: "Platinum", carpet: 701, balcony: 86, sbua: 1065, uds: 334, tags: ["east"], priceAttrs: { sourcingPsf: 6930, closingPsf: 6830 } },
  { series: 5, bhk: "3BHK", typeLabel: "3BHK Luxe", description: "3 BED + 3 TOI (3BHK)", direction: "East", view: "Courtyard", tier: "Platinum", carpet: 960, balcony: 110, sbua: 1450, uds: 455, tags: ["east"], priceAttrs: { sourcingPsf: 6930, closingPsf: 6830 } },
  { series: 6, bhk: "3BHK", typeLabel: "3BHK Ultra", description: "3 BED + 3 TOI (3BHK)", direction: "North", view: "City", tier: "Diamond", carpet: 1100, balcony: 125, sbua: 1660, uds: 520, corner: true, priceAttrs: { sourcingPsf: 6820, closingPsf: 6720 } },
];

const soleaSeries: SeriesSpec[] = [
  { series: 1, bhk: "3 BHK SMART", typeLabel: "2BHK+STUDY", facing: "East", carpet: 1036, sbua: 1627, corner: true, tags: ["east", "corner"], priceAttrs: { plcPsf: 250, parkingValue: 400000 } },
  { series: 2, bhk: "3 BHK SMART", typeLabel: "2BHK+STUDY", facing: "West", carpet: 985, sbua: 1560, corner: true, tags: ["corner"], priceAttrs: { plcPsf: 0, parkingValue: 400000 } },
  { series: 3, bhk: "3 BHK CLASSIC", typeLabel: "3 BHK", facing: "West", carpet: 1155, sbua: 1785, priceAttrs: { plcPsf: 0, parkingValue: 750000 } },
  { series: 4, bhk: "3 BHK CLASSIC", typeLabel: "3 BHK", facing: "East", carpet: 1155, sbua: 1785, tags: ["east"], priceAttrs: { plcPsf: 0, parkingValue: 750000 } },
  { series: 5, bhk: "4 BHK SMART", typeLabel: "4 BHK", facing: "North", carpet: 1360, sbua: 2110, priceAttrs: { plcPsf: 0, parkingValue: 800000 } },
  { series: 6, bhk: "4 BHK SMART", typeLabel: "4 BHK", facing: "South", carpet: 1360, sbua: 2110, priceAttrs: { plcPsf: 0, parkingValue: 800000 } },
  { series: 7, bhk: "4 BHK SMART", typeLabel: "4 BHK", facing: "East", carpet: 1360, sbua: 2110, tags: ["east"], priceAttrs: { plcPsf: 0, parkingValue: 800000 } },
  { series: 8, bhk: "3 BHK SMART", typeLabel: "2BHK+STUDY", facing: "North", carpet: 1036, sbua: 1627, corner: true, tags: ["corner"], priceAttrs: { plcPsf: 250, parkingValue: 400000 } },
];

/** Deterministic pseudo-random in [0,1) from a string, so demo statuses are stable across cold starts. */
function rand(key: string) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function demoStatus(key: string): (typeof s.unitStatusEnum.enumValues)[number] {
  const r = rand(key);
  return r < 0.55 ? "available" : r < 0.8 ? "sold" : r < 0.9 ? "booked" : r < 0.95 ? "blocked" : "on_hold";
}

const num = (n: number | undefined) => (n === undefined ? null : String(n));

export async function seed(db: DB, opts: { demo: boolean }) {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(s.developers);
  if (existing[0].n > 0) return;

  const [sipaniDev, sumadhuraDev, beyondDev] = await db
    .insert(s.developers)
    .values([
      { name: "Sipani", slug: "sipani", colors: { primary: "#1C2033", accent: "#C2276F" } },
      { name: "Sumadhura", slug: "sumadhura", colors: { primary: "#1C2033", accent: "#3D5FD9" } },
      { name: "Beyond Acres", slug: "beyond-acres", colors: { primary: "#1C2033", accent: "#2E9E5B" } },
    ])
    .returning();

  const [sipani, solea, riverine] = await db
    .insert(s.projects)
    .values([
      { developerId: sipaniDev.id, name: "Sipani City", slug: "sipani-city", type: "residential", city: "Bengaluru", reraNumbers: ["PRM/KA/RERA/1251/308/PR/171025/008179"], accentColor: "#C2276F", totalitySiteUrl: "https://sipanicity.totalityre.com", totalityEnvKey: "TOTALITY_SIPANI", waProvider: "doubletick", waEnvKey: "DOUBLETICK", payuEnvKey: "PAYU_SIPANI", publicBooking: true, tokenAmount: "100000" },
      { developerId: sumadhuraDev.id, name: "Sumadhura Solea", slug: "sumadhura-solea", type: "residential", city: "Bengaluru", accentColor: "#3D5FD9", totalitySiteUrl: "https://sumadhuradev.totalityre.com", totalityEnvKey: "TOTALITY_SUMADHURA", payuEnvKey: "PAYU_SUMADHURA", publicBooking: true, tokenAmount: "200000" },
      { developerId: beyondDev.id, name: "The Riverine", slug: "the-riverine", type: "plotted", city: "Mysuru", accentColor: "#2E9E5B", totalitySiteUrl: "https://mysuruprojects.totalityre.com", totalityEnvKey: "TOTALITY_RIVERINE", waProvider: "gallabox", waEnvKey: "GALLABOX_RIVERINE", payuEnvKey: "PAYU_RIVERINE", publicBooking: true, tokenAmount: "200000", gstRate: "0" },
    ])
    .returning();

  const [sipaniPh, soleaPh, riverinePh] = await db
    .insert(s.phases)
    .values([
      { projectId: sipani.id, name: "Window 1 · Sky Floors" },
      { projectId: solea.id, name: "Phase 1" },
      { projectId: riverine.id, name: "Phase 1" },
    ])
    .returning();

  await db.insert(s.priceLists).values([
    { projectId: sipani.id, phaseId: sipaniPh.id, name: "FAR Units · Pre-EMI Offer", version: 1, status: "active", config: sipaniCityFar },
    { projectId: solea.id, phaseId: soleaPh.id, name: "Exclusive July", version: 1, status: "active", config: sumadhuraSolea },
    { projectId: riverine.id, phaseId: riverinePh.id, name: "Launch", version: 1, status: "active", config: riverineLaunch },
  ]);

  const towerDefs = [
    { project: sipani, phase: sipaniPh, name: "A", code: "A", floors: 22, series: sipaniSeries },
    { project: sipani, phase: sipaniPh, name: "C", code: "C", floors: 22, series: sipaniSeries },
    { project: sipani, phase: sipaniPh, name: "E", code: "E", floors: 22, series: sipaniSeries },
    { project: solea, phase: soleaPh, name: "DAPHNE", code: "D", floors: 28, series: soleaSeries },
    { project: solea, phase: soleaPh, name: "E", code: "E", floors: 28, series: soleaSeries },
  ];

  for (const t of towerDefs) {
    const [tower] = await db
      .insert(s.towers)
      .values({ projectId: t.project.id, phaseId: t.phase.id, name: t.name, code: t.code, floors: t.floors, unitsPerFloor: t.series.length })
      .returning();
    const seriesRows = await db
      .insert(s.unitSeries)
      .values(t.series.map((x) => ({ towerId: tower.id, series: x.series, bhk: x.bhk, typeLabel: x.typeLabel, description: x.description, facing: x.facing, direction: x.direction, view: x.view, tier: x.tier, carpet: num(x.carpet), balcony: num(x.balcony), sbua: num(x.sbua), uds: num(x.uds) })))
      .returning();
    const seriesId = new Map(seriesRows.map((r) => [r.series, r.id]));
    const units = generateUnits({ code: t.code, floors: t.floors }, t.series).map((u) => {
      const lo = t.code === "D" && u.floor <= 1; // Solea: landowner share on the lower floors of DAPHNE
      const status = lo ? "blocked" : opts.demo ? demoStatus(u.number + t.project.slug) : "available";
      return {
        projectId: t.project.id,
        phaseId: t.phase.id,
        towerId: tower.id,
        seriesId: seriesId.get(u.series),
        kind: "apartment" as const,
        number: u.number,
        floor: u.floor,
        bhk: u.bhk,
        typeLabel: u.typeLabel,
        description: u.description,
        carpet: num(u.carpet),
        balcony: num(u.balcony),
        sbua: num(u.sbua),
        uds: num(u.uds),
        facing: u.facing ?? u.view,
        direction: u.direction ?? u.facing,
        view: u.view,
        tier: u.tier,
        corner: !!u.corner,
        tags: u.tags ?? [],
        priceAttrs: u.priceAttrs ?? {},
        landownerShare: lo,
        status,
        blockedReason: lo ? "Landowner share" : status === "blocked" ? "Management block" : null,
        holdExpiresAt: status === "on_hold" ? new Date(Date.now() + (2 + rand(u.number) * 20) * 3600_000) : null,
      };
    });
    await db.insert(s.units).values(units);
  }

  await db.insert(s.units).values(
    plots.map((p) => {
      const tags = [p.facing.includes("East") ? "east" : "", p.corner ? "corner" : "", p.premium ? p.premium.toLowerCase() : ""].filter(Boolean);
      return {
        projectId: riverine.id,
        phaseId: riverinePh.id,
        kind: "plot" as const,
        number: p.no,
        typeLabel: p.type,
        plotAreaSqm: String(p.sqm),
        plotAreaSqft: String(p.sqft),
        facing: p.facing,
        direction: p.facing,
        corner: p.corner,
        tags,
        priceAttrs: { facingPsf: p.facingPsf, parkPsf: p.parkPsf, cornerPsf: p.cornerPsf },
        details: { avenue: p.avenue, premium: p.premium || null },
        plan: { x: p.x, y: p.y },
        status: p.status as "available" | "sold" | "blocked",
        blockedReason: p.blocked || null,
      };
    }),
  );

  const pw = hashPassword(opts.demo ? DEMO_PASSWORD : (process.env.ADMIN_PASSWORD ?? ""));
  if (!opts.demo) {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD to seed the first admin");
    await db.insert(s.users).values({ email: process.env.ADMIN_EMAIL, name: "Admin", role: "super_admin", passwordHash: pw, allProjects: true });
    return;
  }

  const [, leader] = await db
    .insert(s.users)
    .values([
      { email: "admin@flowrealty.in", name: "Asha Admin", role: "super_admin", passwordHash: pw, allProjects: true },
      { email: "leadership@flowrealty.in", name: "Leena Lead", role: "leadership", passwordHash: pw, allProjects: true },
    ])
    .returning();
  const [tl] = await db.insert(s.users).values({ email: "teamlead@flowrealty.in", name: "Tarun Team", role: "team_lead", passwordHash: pw, managerId: leader.id, kioskPinHash: hashPassword(DEMO_KIOSK_PIN) }).returning();
  const [sm, ps] = await db
    .insert(s.users)
    .values([
      { email: "sales@flowrealty.in", name: "Sameer Sales", role: "sales_manager", passwordHash: pw, managerId: tl.id, phone: "9000000001" },
      { email: "presales@flowrealty.in", name: "Priya Presales", role: "pre_sales", passwordHash: pw, managerId: tl.id },
    ])
    .returning();
  await db.insert(s.userProjects).values([tl, sm, ps].flatMap((u) => [sipani, solea, riverine].map((p) => ({ userId: u.id, projectId: p.id }))));

  // Fictitious leads so the customer OTP flow has someone to find.
  await db.insert(s.leads).values(
    [sipani, solea, riverine].map((p, i) => ({ projectId: p.id, totalityId: `DEMO-${i + 1}`, name: "Demo Customer", phone: "9999900001", email: "demo.customer@example.com", source: "Website", subSource: "Google Ads", salesManagerId: sm.id, salesManagerName: sm.name, status: "Site visit done", lastSyncedAt: new Date() })),
  );
}
