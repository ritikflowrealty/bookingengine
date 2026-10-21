"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, FileUp, PartyPopper, ShieldCheck, Timer } from "lucide-react";
import type { BookingStatus } from "@/lib/booking/state";
import type { CostSheet } from "@/lib/pricing/engine";
import { Button, Card, cx, Field, Input, Select } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { CostSheetView } from "@/components/CostSheetView";
import { formatINR } from "@/lib/format";
import { KYC_TYPES } from "@/lib/kyc-types";
import { cancelCheckoutAction, demoPaymentSuccessAction, startPaymentAction, submitBookingFormAction, uploadKycAction } from "@/app/actions/customer";

export type CheckoutData = {
  bookingId: string;
  status: BookingStatus;
  unitLabel: string;
  projectName: string;
  holdExpiresAt: string | null;
  tokenAmount: number;
  sheet: Omit<CostSheet, "internal">;
  docsHave: string[];
  docsRequired: string[];
  prefill: { fullName?: string | null; email?: string | null };
  paymentResult?: string | null;
};

const STEPS = [
  { k: "pay", label: "Pay token" },
  { k: "form", label: "Booking form" },
  { k: "kyc", label: "KYC" },
  { k: "done", label: "Done" },
];
const stepOf = (s: BookingStatus) => (s === "held" ? 0 : s === "token_paid" ? 1 : s === "form_submitted" ? 2 : 3);

export function Checkout({ d, kiosk, onFinished }: { d: CheckoutData; kiosk: boolean; onFinished?: () => void }) {
  const step = stepOf(d.status);
  if (d.status === "cancelled")
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <h2 className="text-2xl font-semibold">This reservation has ended</h2>
        <p className="mt-2 text-muted">The hold on {d.unitLabel} expired or was cancelled, so it&apos;s back on sale. You can pick it again if it&apos;s still available.</p>
        <a href="?" className="mt-6 inline-flex h-12 items-center rounded-xl bg-purple px-6 font-medium text-white">Choose a unit</a>
      </Card>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.k} className="text-center">
            <div className={cx("mx-auto h-1.5 rounded-full", i < step ? "bg-purple" : i === step ? "bg-magenta" : "bg-ink/10")} />
            <p className={cx("mt-2 text-xs sm:text-sm", i <= step ? "font-medium" : "text-muted")}>{s.label}</p>
          </li>
        ))}
      </ol>
      {d.status === "held" && <Pay d={d} />}
      {d.status === "token_paid" && <BookingForm d={d} kiosk={kiosk} />}
      {d.status === "form_submitted" && <Kyc d={d} />}
      {step === 3 && <Done d={d} kiosk={kiosk} onFinished={onFinished} />}
    </div>
  );
}

function Pay({ d }: { d: CheckoutData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(d.paymentResult === "failed" ? "The payment didn't go through. You can try again while your hold lasts." : null);
  const [demo, setDemo] = useState<string | null>(null);
  const [payu, setPayu] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (payu) formRef.current?.submit();
  }, [payu]);

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 bg-[#e0a100]/10 p-5">
          <Timer className="h-6 w-6 text-[#8a6200]" />
          <div className="flex-1">
            <p className="font-semibold text-[#6b4c00]">{d.unitLabel} is reserved for you</p>
            {d.holdExpiresAt && (
              <p className="text-sm text-[#8a6200]">
                Pay within <Countdown to={d.holdExpiresAt} className="font-semibold tabular-nums" /> to confirm it.
              </p>
            )}
          </div>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-muted">Booking token</p>
              <p className="font-heading text-4xl font-semibold tabular-nums">{formatINR(d.tokenAmount)}</p>
            </div>
            <p className="text-right text-sm text-muted">
              Agreement value
              <br />
              <b className="text-ink">{formatINR(d.sheet.total)}</b>
            </p>
          </div>
          {error && <p className="rounded-xl bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]">{error}</p>}
          {demo ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-purple/40 bg-purple/5 p-4">
              <p className="text-sm font-medium">Demo payment gateway</p>
              <p className="text-sm text-muted">PayU keys aren&apos;t configured on this preview, so this simulates a successful UPI payment.</p>
              <Button
                size="lg"
                className="w-full"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await demoPaymentSuccessAction(d.bookingId, demo);
                    if (r.ok) router.refresh();
                    else setError(r.error);
                  })
                }
              >
                Pay {formatINR(d.tokenAmount)} (simulated)
              </Button>
            </div>
          ) : (
            <Button
              variant="accent"
              size="xl"
              className="w-full"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await startPaymentAction(d.bookingId);
                  if (!r.ok) return setError(r.error);
                  if (r.data.mode === "demo") setDemo(r.data.txnid);
                  else setPayu({ url: r.data.url, fields: r.data.fields as Record<string, string> });
                })
              }
            >
              <CreditCard className="h-5 w-5" /> {pending ? "Opening payment…" : "Pay with UPI, card or net banking"}
            </Button>
          )}
          <p className="flex items-center justify-center gap-2 text-xs text-muted">
            <ShieldCheck className="h-4 w-4" /> Secure payment by PayU. Confirmation only after the bank confirms.
          </p>
          <button
            className="mx-auto block text-sm text-muted underline-offset-4 hover:underline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await cancelCheckoutAction(d.bookingId);
                if (r.ok) router.replace("?");
              })
            }
          >
            Cancel and choose another unit
          </button>
        </div>
      </Card>
      {payu && (
        <form ref={formRef} method="POST" action={payu.url} className="hidden">
          {Object.entries(payu.fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      )}
      <Card className="p-5 sm:p-6">
        <CostSheetView title="Your price" sheet={d.sheet} compact />
      </Card>
    </>
  );
}

function BookingForm({ d, kiosk }: { d: CheckoutData; kiosk: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [coApp, setCoApp] = useState(false);
  return (
    <Card className="p-5 sm:p-8">
      <div className="flex items-center gap-3 rounded-2xl bg-[#2e9e5b]/10 p-4 text-[#1f6f40]">
        <CheckCircle2 className="h-6 w-6" />
        <p className="font-medium">Token received. {d.unitLabel} is booked in your name.</p>
      </div>
      <h2 className="mt-6 text-xl font-semibold">Booking form</h2>
      <p className="text-sm text-muted">As per your PAN. You can come back to this link any time.</p>
      <form
        className="mt-6 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
          start(async () => {
            const r = await submitBookingFormAction(d.bookingId, data);
            if (r.ok) router.refresh();
            else setError(r.error);
          });
        }}
      >
        <Field label="Full name (as per PAN)"><Input name="fullName" required defaultValue={d.prefill.fullName ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" required defaultValue={d.prefill.email ?? ""} /></Field>
        <Field label="Date of birth"><Input name="dateOfBirth" type="date" required /></Field>
        <Field label="PAN"><Input name="pan" required maxLength={10} className="uppercase" placeholder="ABCDE1234F" /></Field>
        <Field label="Residential status">
          <Select name="residency" defaultValue="Resident Indian">
            {["Resident Indian", "NRI", "OCI / PIO"].map((r) => <option key={r}>{r}</option>)}
          </Select>
        </Field>
        <Field label="Funding">
          <Select name="funding" defaultValue="Own funds">
            {["Own funds", "Home loan"].map((r) => <option key={r}>{r}</option>)}
          </Select>
        </Field>
        <Field label="Occupation"><Input name="occupation" required /></Field>
        <Field label="Company (optional)"><Input name="company" /></Field>
        <div className="sm:col-span-2"><Field label="Address for correspondence"><Input name="address" required /></Field></div>
        <Field label="City"><Input name="city" required /></Field>
        <Field label="PIN code"><Input name="pincode" inputMode="numeric" maxLength={6} required /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 accent-[#7A2DB0]" checked={coApp} onChange={(e) => setCoApp(e.target.checked)} /> Add a co-applicant
        </label>
        {coApp && (
          <>
            <Field label="Co-applicant name"><Input name="coApplicantName" required /></Field>
            <Field label="Relationship"><Input name="coApplicantRelation" /></Field>
            <Field label="Co-applicant mobile"><Input name="coApplicantPhone" inputMode="tel" /></Field>
          </>
        )}
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 accent-[#7A2DB0]" required />
          I confirm these details are correct and agree to the booking terms and the cancellation policy.
        </label>
        {error && <p className="text-sm text-[#b42318] sm:col-span-2">{error}</p>}
        <Button type="submit" size={kiosk ? "xl" : "lg"} className="sm:col-span-2" disabled={pending}>
          {pending ? "Saving…" : "Submit booking form"}
        </Button>
      </form>
    </Card>
  );
}

function Kyc({ d }: { d: CheckoutData }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const have = new Set(d.docsHave);
  const optional = (Object.keys(KYC_TYPES) as (keyof typeof KYC_TYPES)[]).filter((t) => !d.docsRequired.includes(t));
  const upload = async (type: string, file: File | undefined) => {
    if (!file) return;
    setBusy(type);
    setError(null);
    const fd = new FormData();
    fd.set("bookingId", d.bookingId);
    fd.set("type", type);
    fd.set("file", file);
    const r = await uploadKycAction(fd);
    setBusy(null);
    if (!r.ok) setError(r.error);
    router.refresh();
  };
  const Row = ({ t, required }: { t: string; required: boolean }) => (
    <label className={cx("flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition hover:border-purple/40", have.has(t) ? "border-[#2e9e5b]/40 bg-[#2e9e5b]/5" : "border-line")}>
      <span className={cx("flex h-11 w-11 items-center justify-center rounded-xl", have.has(t) ? "bg-[#2e9e5b] text-white" : "bg-ink/5 text-muted")}>{have.has(t) ? <CheckCircle2 className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}</span>
      <span className="flex-1">
        <span className="block font-medium">{KYC_TYPES[t as keyof typeof KYC_TYPES]}</span>
        <span className="text-xs text-muted">{busy === t ? "Uploading…" : have.has(t) ? "Uploaded · tap to replace" : required ? "Required · JPG, PNG or PDF up to 5 MB" : "Optional"}</span>
      </span>
      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture={t === "photo" ? "user" : undefined} className="sr-only" onChange={(e) => upload(t, e.target.files?.[0])} disabled={!!busy} />
    </label>
  );
  return (
    <Card className="space-y-4 p-5 sm:p-8">
      <h2 className="text-xl font-semibold">Upload KYC documents</h2>
      <p className="text-sm text-muted">Stored privately and visible only to your relationship team. Use your phone camera or upload a file.</p>
      {error && <p className="rounded-xl bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]">{error}</p>}
      <div className="grid gap-3">
        {d.docsRequired.map((t) => <Row key={t} t={t} required />)}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-muted">Other documents</summary>
        <div className="mt-3 grid gap-3">{optional.map((t) => <Row key={t} t={t} required={false} />)}</div>
      </details>
    </Card>
  );
}

function Done({ d, kiosk, onFinished }: { d: CheckoutData; kiosk: boolean; onFinished?: () => void }) {
  useEffect(() => {
    if (!kiosk || !onFinished) return;
    const t = setTimeout(onFinished, 20_000);
    return () => clearTimeout(t);
  }, [kiosk, onFinished]);
  return (
    <Card className="overflow-hidden text-center">
      <div className="bg-gradient-to-br from-[#7A2DB0] to-[#C2276F] p-10 text-white">
        <PartyPopper className="mx-auto h-12 w-12" />
        <h2 className="mt-4 text-3xl font-semibold">Congratulations!</h2>
        <p className="mt-2 text-white/80">
          {d.unitLabel} at {d.projectName} is booked. Our team will verify your documents and share the agreement.
        </p>
      </div>
      <div className="p-6 text-sm text-muted">
        {kiosk ? "This screen will reset for the next visitor in a few seconds." : "You'll get updates on WhatsApp. You can revisit this page with your mobile number any time."}
      </div>
    </Card>
  );
}
