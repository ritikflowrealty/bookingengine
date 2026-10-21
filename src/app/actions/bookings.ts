"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { assertCan, can } from "@/lib/auth/permissions";
import { advanceBooking, audit, extendHold } from "@/lib/inventory/service";
import { cancellationNeedsApproval, type BookingEvent } from "@/lib/booking/state";
import { notifyBooking } from "@/lib/integrations/notify";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const err = e as Error & { status?: number };
    if (!err.status) console.error(e);
    return { ok: false, error: err.status ? err.message : "Something went wrong. Please try again." };
  }
}
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

async function loadBooking(id: string) {
  const db = await getDb();
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, id) });
  if (!b) throw fail("Booking not found", 404);
  return { db, b };
}

/** Records a token paid offline (cheque / NEFT / UPI to the collection account). */
export async function recordOfflinePaymentAction(bookingId: string, input: { amount: number; mode: string; reference: string }) {
  return run(async () => {
    const user = await requireStaff();
    const { db, b } = await loadBooking(bookingId);
    assertCan(user.actor, "booking.create", { projectId: b.projectId });
    if (!(input.amount > 0) || !input.reference.trim()) throw fail("Enter the amount and a payment reference");
    await db.transaction(async (tx) => {
      await tx.insert(s.payments).values({ bookingId, txnId: `OFFLINE-${input.mode}-${input.reference.trim()}`, amount: String(input.amount), status: "success", raw: { mode: input.mode, reference: input.reference, recordedBy: user.id } });
      await advanceBooking(tx, bookingId, "pay_token", user.id);
    });
    await notifyBooking(db, bookingId, "token_paid").catch((e) => console.error("notify failed", e));
    revalidatePath(`/app/bookings/${bookingId}`);
    return true;
  });
}

const STAFF_EVENTS: Partial<Record<BookingEvent, "booking.create" | "cancellation.approve">> = { confirm: "booking.create", sign_agreement: "booking.create", register: "booking.create" };

export async function advanceBookingAction(bookingId: string, event: "confirm" | "sign_agreement" | "register") {
  return run(async () => {
    const user = await requireStaff();
    const { db, b } = await loadBooking(bookingId);
    assertCan(user.actor, STAFF_EVENTS[event]!, { projectId: b.projectId });
    if (event === "confirm" && b.kycStatus !== "verified") throw fail("Verify the KYC documents first");
    await advanceBooking(db, bookingId, event, user.id);
    revalidatePath(`/app/bookings/${bookingId}`);
    return true;
  });
}

export async function verifyKycAction(bookingId: string, docId: string | null, verified: boolean) {
  return run(async () => {
    const user = await requireStaff();
    const { db, b } = await loadBooking(bookingId);
    assertCan(user.actor, "booking.create", { projectId: b.projectId });
    if (docId) await db.update(s.kycDocuments).set(verified ? { verifiedBy: user.id, verifiedAt: new Date() } : { verifiedBy: null, verifiedAt: null }).where(and(eq(s.kycDocuments.id, docId), eq(s.kycDocuments.bookingId, bookingId)));
    const docs = await db.query.kycDocuments.findMany({ where: eq(s.kycDocuments.bookingId, bookingId) });
    const all = docs.length > 0 && docs.every((d) => d.verifiedAt);
    await db.update(s.bookings).set({ kycStatus: all ? "verified" : docs.length ? "submitted" : "pending" }).where(eq(s.bookings.id, bookingId));
    await audit(db, { actorId: user.id, action: "kyc.verify", entity: "booking", entityId: bookingId, after: { docId, verified } });
    revalidatePath(`/app/bookings/${bookingId}`);
    return true;
  });
}

/** Cancels directly before the token; afterwards it becomes a leadership approval request. */
export async function cancelBookingAction(bookingId: string, reason: string) {
  return run(async () => {
    const user = await requireStaff();
    const { db, b } = await loadBooking(bookingId);
    assertCan(user.actor, "booking.view", { projectId: b.projectId });
    if (!reason.trim()) throw fail("Give a reason for the cancellation");
    if (!cancellationNeedsApproval(b.status) || can(user.actor, "cancellation.approve", { projectId: b.projectId })) {
      await advanceBooking(db, bookingId, "cancel", user.id);
      await audit(db, { actorId: user.id, action: "booking.cancel_reason", entity: "booking", entityId: bookingId, after: { reason } });
      revalidatePath(`/app/bookings/${bookingId}`);
      return { requested: false };
    }
    await db.insert(s.approvals).values({ type: "cancellation", projectId: b.projectId, unitId: b.unitId, bookingId, requestedBy: user.id, approverId: null, payload: { reason }, comments: reason });
    await audit(db, { actorId: user.id, action: "approval.request", entity: "booking", entityId: bookingId, after: { type: "cancellation", reason } });
    revalidatePath(`/app/bookings/${bookingId}`);
    return { requested: true };
  });
}

export async function decideApprovalAction(approvalId: string, approve: boolean, comments?: string) {
  return run(async () => {
    const user = await requireStaff();
    const db = await getDb();
    const a = await db.query.approvals.findFirst({ where: eq(s.approvals.id, approvalId) });
    if (!a || a.status !== "pending") throw fail("This request is no longer pending");
    const perm = a.type === "discount" ? "discount.approve" : a.type === "hold_extension" ? "hold.extend.approve" : "cancellation.approve";
    assertCan(user.actor, perm, { projectId: a.projectId });
    if (a.approverId && a.approverId !== user.id && user.role !== "super_admin" && user.role !== "leadership") throw fail("This request is assigned to someone else", 403);
    if (a.requestedBy === user.id) throw fail("You can't approve your own request", 403);
    if (approve && a.type === "hold_extension" && a.unitId) await extendHold(db, user.actor, a.unitId, Number((a.payload as { hours?: number }).hours ?? 24));
    if (approve && a.type === "cancellation" && a.bookingId) await advanceBooking(db, a.bookingId, "cancel", user.id);
    await db.update(s.approvals).set({ status: approve ? "approved" : "rejected", approverId: user.id, decidedAt: new Date(), comments: comments || a.comments }).where(eq(s.approvals.id, approvalId));
    await audit(db, { actorId: user.id, action: approve ? "approval.approve" : "approval.reject", entity: "approval", entityId: approvalId, before: { status: "pending" }, after: { status: approve ? "approved" : "rejected", type: a.type, payload: a.payload } });
    revalidatePath("/app/approvals");
    return true;
  });
}
