import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { currentCustomer, currentStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { verifyKycSignature } from "@/lib/kyc";

export const runtime = "nodejs";

/** Serves a KYC file only with a valid short-lived signature AND to a viewer allowed to see that booking. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  if (!verifyKycSignature(id, q.get("exp"), q.get("sig"))) return new Response("Link expired", { status: 403 });
  const db = await getDb();
  const doc = await db.query.kycDocuments.findFirst({ where: eq(s.kycDocuments.id, id) });
  if (!doc?.content) return new Response("Not found", { status: 404 });
  const booking = (await db.query.bookings.findFirst({ where: eq(s.bookings.id, doc.bookingId) }))!;
  const [staff, customer] = await Promise.all([currentStaff(), currentCustomer()]);
  const allowed = (staff && can(staff.actor, "booking.create", { projectId: booking.projectId })) || (customer && customer.id === booking.customerId);
  if (!allowed) return new Response("Forbidden", { status: 403 });
  return new Response(new Uint8Array(doc.content), { headers: { "Content-Type": doc.mime, "Content-Disposition": `inline; filename="${doc.type}-${doc.storageKey.replace(/[^\w.-]/g, "_")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
