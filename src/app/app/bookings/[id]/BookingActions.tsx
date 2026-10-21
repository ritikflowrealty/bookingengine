"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";
import type { BookingStatus } from "@/lib/booking/state";
import { Button, Card, cx, Field, Input, Select } from "@/components/ui";
import { KYC_TYPES } from "@/lib/kyc";
import { advanceBookingAction, cancelBookingAction, recordOfflinePaymentAction, verifyKycAction } from "@/app/actions/bookings";

type Doc = { id: string; type: string; name: string; url: string; verified: boolean };

export function BookingActions({ bookingId, status, kycStatus, bookingLink, tokenAmount, docs, pendingCancellation }: { bookingId: string; status: BookingStatus; kycStatus: string; bookingLink: string; tokenAmount: number; docs: Doc[]; pendingCancellation: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = useState("UPI");
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState(String(tokenAmount));
  const [reason, setReason] = useState("");
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Failed" });
    });
  const link = typeof window !== "undefined" ? window.location.origin + bookingLink : bookingLink;
  const live = status !== "cancelled" && status !== "registered";

  return (
    <div className="space-y-6">
      {msg && <p className={cx("rounded-xl px-4 py-3 text-sm", msg.ok ? "bg-[#2e9e5b]/10 text-[#1f6f40]" : "bg-[#fef3f2] text-[#b42318]")}>{msg.text}</p>}

      {live && (
        <Card className="space-y-3 p-5">
          <h2 className="text-base font-semibold">Customer link</h2>
          <p className="text-sm text-muted">The customer signs in with a WhatsApp OTP to pay the token online, fill the booking form and upload KYC.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(link).then(() => setMsg({ ok: true, text: "Link copied" }))}>
              <Copy className="h-4 w-4" /> Copy link
            </Button>
            <a className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#25D366] px-3 text-sm font-medium text-white" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Complete your booking here: ${link}`)}`}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        </Card>
      )}

      {status === "held" && (
        <Card className="p-5">
          <h2 className="text-base font-semibold">Record token received offline</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              act(() => recordOfflinePaymentAction(bookingId, { amount: Number(amount), mode, reference: ref }), "Token recorded · unit is now booked");
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mode">
                <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                  {["UPI", "NEFT/RTGS", "Cheque", "Card (POS)"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount (₹)">
                <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
            <Field label="Reference / UTR / cheque no.">
              <Input required value={ref} onChange={(e) => setRef(e.target.value)} />
            </Field>
            <Button type="submit" disabled={pending} className="w-full">
              Mark token paid
            </Button>
          </form>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">KYC documents</h2>
          <span className="text-xs text-muted capitalize">{kycStatus}</span>
        </div>
        {docs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Not uploaded yet. The customer uploads them from the booking link.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{KYC_TYPES[d.type as keyof typeof KYC_TYPES] ?? d.type}</p>
                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-xs text-purple">
                    {d.name} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <Button size="sm" variant={d.verified ? "secondary" : "primary"} disabled={pending} onClick={() => act(() => verifyKycAction(bookingId, d.id, !d.verified), d.verified ? "Marked unverified" : "Verified")}>
                  {d.verified ? <Check className="h-4 w-4 text-[#2e9e5b]" /> : null}
                  {d.verified ? "Verified" : "Verify"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Document links expire after 5 minutes.</p>
      </Card>

      {live && (
        <Card className="space-y-3 p-5">
          <h2 className="text-base font-semibold">Next step</h2>
          <div className="flex flex-wrap gap-2">
            {status === "kyc_submitted" && (
              <Button disabled={pending || kycStatus !== "verified"} onClick={() => act(() => advanceBookingAction(bookingId, "confirm"), "Booking confirmed")}>
                Confirm booking
              </Button>
            )}
            {status === "confirmed" && <Button disabled={pending} onClick={() => act(() => advanceBookingAction(bookingId, "sign_agreement"), "Agreement recorded")}>Agreement signed</Button>}
            {status === "agreement" && <Button disabled={pending} onClick={() => act(() => advanceBookingAction(bookingId, "register"), "Registered")}>Mark registered</Button>}
            {["held", "token_paid", "form_submitted"].includes(status) && <p className="text-sm text-muted">Waiting for the customer: {status === "held" ? "token payment" : status === "token_paid" ? "booking form" : "KYC upload"}.</p>}
          </div>
        </Card>
      )}

      {live && (
        <Card className="space-y-3 p-5">
          <h2 className="text-base font-semibold">Cancel booking</h2>
          {pendingCancellation ? (
            <p className="text-sm text-muted">Cancellation requested · waiting for leadership approval.</p>
          ) : (
            <>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
              <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => act(() => cancelBookingAction(bookingId, reason), status === "held" ? "Cancelled · unit released" : "Cancellation submitted")}>
                {status === "held" ? "Cancel and release unit" : "Request cancellation"}
              </Button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
