"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, DEMO } from "@/db";
import * as s from "@/db/schema";
import { createCustomerSession, currentCustomer, logoutCustomer } from "@/lib/auth/session";
import { createOtp, verifyOtp } from "@/lib/auth/otp";
import { randomToken } from "@/lib/auth/password";
import { sendTemplate, type WaProvider } from "@/lib/integrations/whatsapp";
import { payuCreds, payuForm, payuUrl } from "@/lib/integrations/payu";
import { advanceBooking, audit, effectiveStatus, quote, startBooking } from "@/lib/inventory/service";
import { toCustomerView } from "@/lib/pricing/engine";
import { notifyBooking } from "@/lib/integrations/notify";
import { KYC_MAX_BYTES, KYC_MIME, KYC_TYPES } from "@/lib/kyc";

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

async function projectBySlug(slug: string) {
  const db = await getDb();
  const p = await db.query.projects.findFirst({ where: eq(s.projects.slug, slug) });
  if (!p || !p.publicBooking) throw fail("Online booking is not open for this project", 404);
  return { db, project: p };
}

async function requireCustomer() {
  const c = await currentCustomer();
  if (!c) throw fail("Your session has expired. Please sign in again.", 401);
  return c;
}

async function ownBooking(bookingId: string) {
  const c = await requireCustomer();
  const db = await getDb();
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) });
  if (!b || b.customerId !== c.id) throw fail("Booking not found", 404);
  return { db, c, b };
}

export async function requestOtpAction(slug: string, phone: string) {
  return run(async () => {
    const { db, project } = await projectBySlug(slug);
    const { phone: p, code } = await createOtp(db, phone);
    if (DEMO) return { demoCode: code }; // demo mode shows the code on screen instead of sending it
    try {
      await sendTemplate({ provider: project.waProvider as WaProvider, envKey: project.waEnvKey }, p, process.env.WA_OTP_TEMPLATE ?? "otp_authentication", [code]);
    } catch (e) {
      console.error("WhatsApp OTP failed", e);
      throw fail("We couldn't send the code on WhatsApp. Please try again in a minute.", 502);
    }
    return { demoCode: null };
  });
}

export async function verifyOtpAction(slug: string, phone: string, code: string, kiosk: boolean) {
  return run(async () => {
    const { db } = await projectBySlug(slug);
    const p = await verifyOtp(db, phone, code);
    let customer = await db.query.customers.findFirst({ where: eq(s.customers.phone, p) });
    if (!customer) {
      const lead = await db.query.leads.findFirst({ where: eq(s.leads.phone, p) });
      [customer] = await db.insert(s.customers).values({ phone: p, name: lead?.name ?? null, email: lead?.email ?? null }).returning();
    }
    await createCustomerSession(customer.id, kiosk);
    await audit(db, { actorId: customer.id, actorType: "customer", action: "auth.otp_login", entity: "customer", entityId: customer.id, after: { kiosk } });
    return true;
  });
}

export async function customerLogoutAction() {
  await logoutCustomer();
}

/** What the signed-in customer may see about themselves: their lead(s), never other people's data or staff phones. */
export async function customerProfile(slug: string) {
  const c = await currentCustomer();
  if (!c) return null;
  const db = await getDb();
  const leads = await db.select({ lead: s.leads, project: s.projects.name, projectSlug: s.projects.slug }).from(s.leads).innerJoin(s.projects, eq(s.leads.projectId, s.projects.id)).where(eq(s.leads.phone, c.phone));
  const here = leads.find((l) => l.projectSlug === slug)?.lead ?? leads[0]?.lead;
  const bookings = await db
    .select({ id: s.bookings.id, status: s.bookings.status, unit: s.units.number, project: s.projects.name, slug: s.projects.slug })
    .from(s.bookings)
    .innerJoin(s.units, eq(s.bookings.unitId, s.units.id))
    .innerJoin(s.projects, eq(s.bookings.projectId, s.projects.id))
    .where(and(eq(s.bookings.customerId, c.id), inArray(s.bookings.status, ["held", "token_paid", "form_submitted", "kyc_submitted", "confirmed", "agreement", "registered"])))
    .orderBy(desc(s.bookings.createdAt));
  return {
    name: c.name ?? here?.name ?? null,
    phone: c.phone,
    email: c.email ?? here?.email ?? null,
    source: here ? [here.source, here.subSource].filter(Boolean).join(" · ") : null,
    projects: [...new Set(leads.map((l) => l.project))],
    salesManager: here?.salesManagerName?.split(" ")[0] ?? null,
    kiosk: c.kiosk,
    bookings,
  };
}

export async function customerQuoteAction(slug: string, unitId: string) {
  return run(async () => {
    await requireCustomer();
    const { db, project } = await projectBySlug(slug);
    const unit = await db.query.units.findFirst({ where: and(eq(s.units.id, unitId), eq(s.units.projectId, project.id)) });
    if (!unit) throw fail("Unit not found", 404);
    const { sheet } = await quote(db, unitId);
    return { sheet: toCustomerView(sheet), available: effectiveStatus(unit) === "available", tokenAmount: Number(project.tokenAmount), holdMinutes: project.checkoutHoldMinutes };
  });
}

export async function startCustomerBookingAction(slug: string, unitId: string) {
  return run(async () => {
    const c = await requireCustomer();
    const { db, project } = await projectBySlug(slug);
    const unit = await db.query.units.findFirst({ where: and(eq(s.units.id, unitId), eq(s.units.projectId, project.id)) });
    if (!unit) throw fail("Unit not found", 404);
    // One checkout at a time per customer, so nobody can tie up many units.
    const open = await db.query.bookings.findFirst({ where: and(eq(s.bookings.customerId, c.id), eq(s.bookings.status, "held"), eq(s.bookings.projectId, project.id)) });
    if (open) {
      const u = await db.query.units.findFirst({ where: eq(s.units.id, open.unitId) });
      if (u && u.status === "on_hold" && u.bookingId === open.id && u.holdExpiresAt && u.holdExpiresAt > new Date()) throw fail(`You already have ${u.number} on hold. Finish or cancel that booking first.`, 409);
    }
    const lead = await db.query.leads.findFirst({ where: and(eq(s.leads.phone, c.phone), eq(s.leads.projectId, project.id)) });
    const booking = await startBooking(db, { unitId, customerId: c.id, leadId: lead?.id, salesManagerId: lead?.salesManagerId, actor: null });
    if (!lead) await db.insert(s.syncJobs).values({ kind: "totality.create_lead", projectId: project.id, payload: { phone: c.phone, name: c.name, source: c.kiosk ? "Kiosk booking" : "Website booking" } });
    return { bookingId: booking.id };
  });
}

export async function cancelCheckoutAction(bookingId: string) {
  return run(async () => {
    const { db, c, b } = await ownBooking(bookingId);
    if (b.status !== "held") throw fail("This booking can no longer be cancelled online. Please contact your relationship manager.");
    await advanceBooking(db, bookingId, "cancel", c.id, "customer");
    return true;
  });
}

/** Creates a PayU transaction for the token, or (demo / no PayU keys) a simulated one. */
export async function startPaymentAction(bookingId: string) {
  return run(async () => {
    const { db, c, b } = await ownBooking(bookingId);
    if (b.status !== "held") throw fail("This booking is not awaiting payment");
    const unit = (await db.query.units.findFirst({ where: eq(s.units.id, b.unitId) }))!;
    if (unit.bookingId !== b.id || !unit.holdExpiresAt || unit.holdExpiresAt < new Date()) throw fail("Your hold on this unit has expired. Please choose the unit again.", 409);
    const project = (await db.query.projects.findFirst({ where: eq(s.projects.id, b.projectId) }))!;
    const creds = payuCreds(project.payuEnvKey);
    const txnid = `FI${Date.now().toString(36)}${randomToken(4).replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 25);
    const amount = Number(b.tokenAmount).toFixed(2);
    await db.insert(s.payments).values({ bookingId, txnId: txnid, amount, status: "initiated" });
    if (!creds) {
      if (!DEMO) throw fail("Online payment isn't set up for this project yet. Your relationship manager can collect the token.", 503);
      return { mode: "demo" as const, txnid };
    }
    const base = process.env.APP_URL ?? "";
    const fields = payuForm(creds, {
      txnid,
      amount,
      productinfo: `Booking token ${unit.number} ${project.name}`.slice(0, 100),
      firstname: (c.name ?? "Customer").split(" ")[0].replace(/[^a-zA-Z ]/g, "") || "Customer",
      email: c.email ?? "bookings@flowrealty.in",
      phone: c.phone,
      surl: `${base}/api/payu/callback`,
      furl: `${base}/api/payu/callback`,
      udf1: bookingId,
    });
    return { mode: "payu" as const, url: payuUrl(), fields };
  });
}

/** Demo only: simulates PayU's verified success callback. */
export async function demoPaymentSuccessAction(bookingId: string, txnid: string) {
  return run(async () => {
    if (!DEMO) throw fail("Not available", 404);
    const { db, b } = await ownBooking(bookingId);
    await db.transaction(async (tx) => {
      await tx.update(s.payments).set({ status: "success", raw: { demo: true }, updatedAt: new Date() }).where(and(eq(s.payments.txnId, txnid), eq(s.payments.bookingId, b.id)));
      await advanceBooking(tx, bookingId, "pay_token", null, "system");
    });
    await notifyBooking(db, bookingId, "token_paid");
    return true;
  });
}

const formSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  email: z.string().trim().email("Enter a valid email"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth"),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN, e.g. ABCDE1234F"),
  residency: z.enum(["Resident Indian", "NRI", "OCI / PIO"]),
  occupation: z.string().trim().min(2, "Enter your occupation"),
  company: z.string().trim().optional(),
  address: z.string().trim().min(10, "Enter your full address"),
  city: z.string().trim().min(2, "Enter your city"),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit PIN code"),
  funding: z.enum(["Own funds", "Home loan"]),
  coApplicantName: z.string().trim().optional(),
  coApplicantRelation: z.string().trim().optional(),
  coApplicantPhone: z.string().trim().optional(),
  consent: z.literal("on", { message: "Please accept the terms to continue" }),
});
export type BookingFormInput = z.input<typeof formSchema>;

export async function submitBookingFormAction(bookingId: string, input: Record<string, string>) {
  return run(async () => {
    const { db, c, b } = await ownBooking(bookingId);
    if (b.status !== "token_paid") throw fail("The booking form opens after the token is paid");
    const parsed = formSchema.safeParse(input);
    if (!parsed.success) throw fail(parsed.error.issues[0]?.message ?? "Please check the form");
    const f = parsed.data;
    await db.transaction(async (tx) => {
      await tx.update(s.customers).set({ name: f.fullName, email: f.email, kyc: { ...f, consent: "accepted" } }).where(eq(s.customers.id, c.id));
      await tx.delete(s.coApplicants).where(eq(s.coApplicants.bookingId, b.id));
      if (f.coApplicantName) await tx.insert(s.coApplicants).values({ bookingId: b.id, name: f.coApplicantName, relation: f.coApplicantRelation, details: { phone: f.coApplicantPhone } });
      await tx.update(s.bookings).set({ formStatus: "submitted" }).where(eq(s.bookings.id, b.id));
      await advanceBooking(tx, b.id, "submit_form", c.id, "customer");
    });
    return true;
  });
}

const REQUIRED_DOCS = { "Resident Indian": ["pan", "aadhaar", "photo"], NRI: ["pan", "passport", "photo", "address_proof"], "OCI / PIO": ["pan", "oci", "passport", "photo"] } as const;

export async function uploadKycAction(form: FormData) {
  return run(async () => {
    const bookingId = String(form.get("bookingId"));
    const type = String(form.get("type"));
    const file = form.get("file");
    const { db, c, b } = await ownBooking(bookingId);
    if (!["form_submitted", "kyc_submitted"].includes(b.status)) throw fail("Submit the booking form first");
    if (!(type in KYC_TYPES)) throw fail("Unknown document type");
    if (!(file instanceof File) || file.size === 0) throw fail("Choose a file");
    if (file.size > KYC_MAX_BYTES) throw fail("Files must be 5 MB or smaller");
    if (!KYC_MIME.includes(file.type)) throw fail("Upload a JPG, PNG, WebP or PDF");
    const content = Buffer.from(await file.arrayBuffer());
    await db.delete(s.kycDocuments).where(and(eq(s.kycDocuments.bookingId, b.id), eq(s.kycDocuments.type, type)));
    await db.insert(s.kycDocuments).values({ bookingId: b.id, type, storageKey: file.name.slice(0, 120), mime: file.type, size: file.size, content });
    await audit(db, { actorId: c.id, actorType: "customer", action: "kyc.upload", entity: "booking", entityId: b.id, after: { type, size: file.size } });
    const residency = ((await db.query.customers.findFirst({ where: eq(s.customers.id, c.id) }))?.kyc as { residency?: keyof typeof REQUIRED_DOCS })?.residency ?? "Resident Indian";
    const have = new Set((await db.query.kycDocuments.findMany({ where: eq(s.kycDocuments.bookingId, b.id), columns: { type: true } })).map((d) => d.type));
    const complete = REQUIRED_DOCS[residency].every((t) => have.has(t));
    if (complete && b.status === "form_submitted") {
      await db.update(s.bookings).set({ kycStatus: "submitted" }).where(eq(s.bookings.id, b.id));
      await advanceBooking(db, b.id, "submit_kyc", c.id, "customer");
    }
    return { complete, have: [...have] };
  });
}

export async function requiredDocsFor(residency: string | undefined) {
  return [...(REQUIRED_DOCS[(residency as keyof typeof REQUIRED_DOCS) ?? "Resident Indian"] ?? REQUIRED_DOCS["Resident Indian"])];
}
