"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { requestOtpAction, verifyOtpAction } from "@/app/actions/customer";

export function OtpLogin({ slug, kiosk }: { slug: string; kiosk: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const size = kiosk ? "xl" : "lg";

  return (
    <div className="space-y-6">
      {!sent ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const r = await requestOtpAction(slug, phone);
              if (!r.ok) return setError(r.error);
              setSent(true);
              setDemoCode(r.data.demoCode);
            });
          }}
        >
          <Field label="Mobile number" error={error}>
            <div className="flex gap-2">
              <span className="flex h-12 items-center rounded-xl border border-line bg-bg px-4 text-muted">+91</span>
              <Input inputMode="numeric" autoComplete="tel-national" maxLength={10} required value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98450 12345" className={kiosk ? "h-14 text-xl" : ""} autoFocus />
            </div>
          </Field>
          <Button type="submit" size={size} className="w-full" disabled={pending || phone.length !== 10}>
            <MessageCircle className="h-5 w-5" /> {pending ? "Sending…" : "Send code on WhatsApp"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const r = await verifyOtpAction(slug, phone, code, kiosk);
              if (!r.ok) return setError(r.error);
              router.refresh();
            });
          }}
        >
          <p className="text-sm text-muted">
            We sent a 6-digit code to WhatsApp on +91 {phone}.{" "}
            <button type="button" className="font-medium text-purple" onClick={() => (setSent(false), setCode(""))}>
              Change
            </button>
          </p>
          {demoCode && <p className="rounded-xl bg-purple/8 px-4 py-3 text-sm">Demo mode · your code is <b className="tracking-widest">{demoCode}</b></p>}
          <Field label="Verification code" error={error}>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`text-center tracking-[0.6em] ${kiosk ? "h-16 text-3xl" : "text-xl"}`} autoFocus />
          </Field>
          <Button type="submit" size={size} className="w-full" disabled={pending || code.length !== 6}>
            {pending ? "Verifying…" : "Verify and continue"}
          </Button>
        </form>
      )}
      <p className="flex items-center gap-2 text-xs text-muted">
        <ShieldCheck className="h-4 w-4" /> Your number is used only to find your enquiry and secure your booking.
      </p>
    </div>
  );
}
