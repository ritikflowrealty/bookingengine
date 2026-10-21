import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { payuCreds, verifyPayuResponse } from "@/lib/integrations/payu";
import { advanceBooking, audit } from "@/lib/inventory/service";
import { notifyBooking } from "@/lib/integrations/notify";

export const runtime = "nodejs";

/**
 * PayU surl/furl and server-to-server webhook. The token is marked paid only when the reverse hash verifies
 * with the project's salt AND the amount matches; the browser redirect alone is never trusted. Idempotent.
 */
export async function POST(req: Request) {
  const body = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  const db = await getDb();
  const payment = await db.query.payments.findFirst({ where: eq(s.payments.txnId, body.txnid ?? "") });
  if (!payment) return new Response("Unknown transaction", { status: 404 });
  const booking = (await db.query.bookings.findFirst({ where: eq(s.bookings.id, payment.bookingId) }))!;
  const project = (await db.query.projects.findFirst({ where: eq(s.projects.id, booking.projectId) }))!;
  const back = Response.redirect(new URL(`/p/${project.slug}/book?booking=${booking.id}&payment=${body.status === "success" ? "done" : "failed"}`, req.url), 303);
  const creds = payuCreds(project.payuEnvKey);
  if (!creds || !verifyPayuResponse(creds, body)) {
    await audit(db, { actorType: "system", action: "payu.bad_signature", entity: "payment", entityId: payment.id, after: { txnid: body.txnid } });
    return new Response("Invalid signature", { status: 400 });
  }
  if (payment.status === "success") return back; // already processed (redirect + webhook both arrive)
  const ok = body.status === "success" && Number(body.amount) === Number(payment.amount) && body.udf1 === booking.id;
  await db.transaction(async (tx) => {
    await tx.update(s.payments).set({ status: ok ? "success" : "failure", payuId: body.mihpayid ?? null, raw: body, updatedAt: new Date() }).where(and(eq(s.payments.id, payment.id), eq(s.payments.status, "initiated")));
    if (ok && booking.status === "held") await advanceBooking(tx, booking.id, "pay_token", null, "system");
  });
  if (ok) await notifyBooking(db, booking.id, "token_paid").catch((e) => console.error("notify failed", e));
  // shortcut: a success that arrives after the hold expired (booking already cancelled) is recorded but needs a manual refund; surfaced in the payment row.
  return back;
}
