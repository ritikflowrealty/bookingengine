import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";

/**
 * Queues the side effects of a booking milestone: WhatsApp to the customer, alerts to the sales manager and
 * team lead, and the Totality CRM update. The cron worker sends them with retries (see worker.ts).
 */
export async function notifyBooking(db: DB, bookingId: string, milestone: "token_paid" | "confirmed" | "cancelled") {
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) });
  if (!b) return;
  const [unit, project, customer] = await Promise.all([
    db.query.units.findFirst({ where: eq(s.units.id, b.unitId) }),
    db.query.projects.findFirst({ where: eq(s.projects.id, b.projectId) }),
    b.customerId ? db.query.customers.findFirst({ where: eq(s.customers.id, b.customerId) }) : null,
  ]);
  const staffIds = [b.salesManagerId, b.teamLeadId].filter((x): x is string => !!x);
  const staff = staffIds.length ? await db.query.users.findMany({ where: (u, { inArray }) => inArray(u.id, staffIds) }) : [];
  const jobs: (typeof s.syncJobs.$inferInsert)[] = [];
  const unitLabel = `${unit?.number} at ${project?.name}`;
  if (customer?.phone && milestone === "token_paid") {
    jobs.push({ kind: "wa.send", projectId: b.projectId, payload: { to: customer.phone, template: process.env.WA_BOOKING_TEMPLATE ?? "booking_confirmation", params: [customer.name ?? "Customer", unitLabel, String(Math.round(Number(b.tokenAmount)))] } });
  }
  for (const u of staff) {
    if (u.phone) jobs.push({ kind: "wa.send", projectId: b.projectId, payload: { to: u.phone, template: process.env.WA_STAFF_ALERT_TEMPLATE ?? "booking_alert", params: [u.name, milestone.replace("_", " "), unitLabel, customer?.name ?? ""] } });
  }
  jobs.push({ kind: "totality.push_booking", projectId: b.projectId, payload: { bookingId, milestone } });
  await db.insert(s.syncJobs).values(jobs);
}
