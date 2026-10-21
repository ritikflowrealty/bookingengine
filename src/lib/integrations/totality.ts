import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";

// Totality CRM: one site per project (projects.totality_site_url), credentials from env
// <TOTALITY_ENV_KEY>_USER / _PASSWORD. The mappers below are pure and tested; the HTTP calls need
// Totality's API reference.
// shortcut: endpoint paths are not known yet, so pushes fail with a clear error and stay queued for retry; wire the real API in Phase 6.

export type TotalityLead = { id: string; name?: string; mobile?: string; email?: string; source?: string; sub_source?: string; presales?: string; sales_manager?: string; status?: string };

/** Maps a Totality lead record to our cached `leads` row. */
export function mapLead(projectId: string, t: TotalityLead) {
  const phone = (t.mobile ?? "").replace(/\D/g, "").slice(-10);
  return { projectId, totalityId: String(t.id), name: t.name?.trim() || null, phone, email: t.email?.trim() || null, source: t.source || null, subSource: t.sub_source || null, preSales: t.presales || null, salesManagerName: t.sales_manager || null, status: t.status || null, lastSyncedAt: new Date() };
}

/** Maps a booking to the fields Totality's booking/status update expects. */
export function mapBooking(b: { id: string; status: string; tokenAmount: string; costSheet: { total: number } }, unitNumber: string, lead?: { totalityId: string | null } | null) {
  return { lead_id: lead?.totalityId ?? null, unit_no: unitNumber, booking_ref: b.id, booking_status: b.status, token_amount: Number(b.tokenAmount), agreement_value: Math.round(b.costSheet.total) };
}

export async function pushBookingToTotality(db: DB, bookingId: string) {
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) });
  if (!b) throw new Error("Booking not found");
  const [project, unit, lead] = await Promise.all([
    db.query.projects.findFirst({ where: eq(s.projects.id, b.projectId) }),
    db.query.units.findFirst({ where: eq(s.units.id, b.unitId) }),
    b.leadId ? db.query.leads.findFirst({ where: eq(s.leads.id, b.leadId) }) : null,
  ]);
  const key = project?.totalityEnvKey;
  if (!project?.totalitySiteUrl || !key || !process.env[`${key}_USER`]) throw new Error(`Totality credentials not configured (${key ?? "no env key"}_USER / _PASSWORD)`);
  const body = mapBooking(b, unit?.number ?? "", lead);
  throw new Error(`Totality API endpoint not wired yet; payload ready: ${JSON.stringify(body)}`);
}
