"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, Download, Lock, MessageCircle, Share2, Timer, Unlock, X } from "lucide-react";
import type { ClientUnit } from "@/lib/inventory/client-unit";
import type { CostSheet } from "@/lib/pricing/engine";
import { floorLabel } from "@/lib/inventory/generate";
import { Badge, Button, cx, Field, Input, StatusBadge } from "@/components/ui";
import { CostSheetView } from "@/components/CostSheetView";
import { Countdown } from "@/components/Countdown";
import {
  blockAction,
  extendHoldAction,
  getQuoteAction,
  holdAction,
  releaseAction,
  requestDiscountAction,
  requestExtensionAction,
  shareCostSheetAction,
  startStaffBookingAction,
} from "@/app/actions/inventory";

export type Perms = { userId: string; canHold: boolean; canApproveHold: boolean; canBlock: boolean; canBook: boolean; canShare: boolean; internal: boolean };
type Quote = { sheet: CostSheet; priceListName: string; needsApprovalFrom: string | null; internal: boolean; offers: string[] };

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const OFFER_LABEL: Record<string, string> = { no_offer: "No offer (lower base)" };

export function UnitPanel({ unit, towerName, projectName, perms, onClose, onChanged }: { unit: ClientUnit; towerName?: string; projectName: string; perms: Perms; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [discount, setDiscount] = useState("");
  const [offer, setOffer] = useState<string>("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [booking, setBooking] = useState(false);
  const [pending, start] = useTransition();
  const discountPsf = Number(discount) || 0;

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await getQuoteAction(unit.id, { discountPsf, offer: offer || undefined });
      if (!live) return;
      if (r.ok) setQuote(r.data as Quote);
      else setError(r.error);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [unit.id, discountPsf, offer, unit.status]);

  useEffect(() => {
    setShareUrl(null);
    setNotice(null);
    setError(null);
    setBooking(false);
  }, [unit.id]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await fn();
      if (r.ok) {
        if (ok) setNotice(ok);
        onChanged();
      } else setError(r.error ?? "Failed");
    });

  const mine = unit.status === "on_hold" && unit.heldBy === perms.userId;
  const area = unit.kind === "plot" ? `${Number(unit.plotAreaSqft).toLocaleString("en-IN")} sq ft` : unit.sbua ? `${Number(unit.sbua).toLocaleString("en-IN")} sq ft SBUA` : "";
  const facts: [string, string | null | undefined][] =
    unit.kind === "plot"
      ? [
          ["Plot area", `${Number(unit.plotAreaSqft).toLocaleString("en-IN")} sq ft · ${unit.plotAreaSqm} m²`],
          ["Type", unit.typeLabel],
          ["Facing", unit.facing],
          ["Avenue", (unit.details as { avenue?: string })?.avenue],
          ["Corner", unit.corner ? "Yes" : "No"],
          ["Premium", (unit.details as { premium?: string })?.premium ?? "—"],
        ]
      : [
          ["Tower · Floor", `${towerName ?? ""} · ${floorLabel(unit.floor ?? 0)}`],
          ["Type", [unit.bhk, unit.typeLabel].filter(Boolean).join(" · ")],
          ["SBUA", unit.sbua && `${Number(unit.sbua).toLocaleString("en-IN")} sq ft`],
          ["Carpet", unit.carpet && `${Number(unit.carpet).toLocaleString("en-IN")} sq ft`],
          ["Facing", [unit.direction, unit.view].filter(Boolean).join(" · ") || unit.facing],
          ["Tier", unit.tier],
          ["UDS", unit.uds && `${Number(unit.uds).toLocaleString("en-IN")} sq ft`],
          ["Corner", unit.corner ? "Yes" : "No"],
        ];
  const discountQuery = new URLSearchParams({ ...(discountPsf ? { discount: String(discountPsf) } : {}), ...(offer ? { offer } : {}), ...(customerName ? { name: customerName } : {}) }).toString();
  const absShare = shareUrl && typeof window !== "undefined" ? `${window.location.origin}${shareUrl}` : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">
            {projectName}
            {towerName ? ` · Tower ${towerName}` : ""}
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">{unit.kind === "plot" ? `Plot ${unit.number}` : unit.number}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={unit.status} />
            {area && <Badge>{area}</Badge>}
            {unit.landownerShare && <Badge tone="amber">Landowner share</Badge>}
          </div>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-ink/5" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {unit.status === "on_hold" && unit.holdExpiresAt && (
          <div className="flex items-center gap-3 rounded-2xl bg-[#e0a100]/10 p-4 text-sm">
            <Timer className="h-5 w-5 text-[#8a6200]" />
            <div className="flex-1">
              <p className="font-medium text-[#6b4c00]">{mine ? "Held by you" : "On hold"}</p>
              <p className="text-[#8a6200]">
                Releases in <Countdown to={unit.holdExpiresAt} className="font-semibold tabular-nums" />
              </p>
            </div>
          </div>
        )}
        {unit.status === "blocked" && unit.blockedReason && <p className="rounded-2xl bg-ink/5 p-4 text-sm">Blocked: {unit.blockedReason}</p>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
        </dl>

        {(error || notice) && <p className={cx("rounded-xl px-4 py-3 text-sm", error ? "bg-[#fef3f2] text-[#b42318]" : "bg-[#2e9e5b]/10 text-[#1f6f40]")}>{error ?? notice}</p>}

        <div className="flex flex-wrap gap-2">
          {unit.status === "available" && perms.canHold && (
            <Button onClick={() => act(() => holdAction(unit.id), "Unit held")} disabled={pending}>
              <Lock className="h-4 w-4" /> Hold unit
            </Button>
          )}
          {unit.status === "available" && perms.canBook && (
            <Button variant="accent" onClick={() => setBooking((b) => !b)} disabled={pending}>
              Start booking
            </Button>
          )}
          {mine && perms.canBook && (
            <Button variant="accent" onClick={() => setBooking((b) => !b)} disabled={pending}>
              Book for customer
            </Button>
          )}
          {(mine || (unit.status === "on_hold" && perms.canApproveHold)) && (
            <Button variant="secondary" onClick={() => act(() => releaseAction(unit.id), "Released")} disabled={pending}>
              <Unlock className="h-4 w-4" /> Release
            </Button>
          )}
          {unit.status === "on_hold" && perms.canApproveHold && (
            <Button variant="secondary" onClick={() => act(() => extendHoldAction(unit.id, 24), "Extended by 24 hours")} disabled={pending}>
              <Timer className="h-4 w-4" /> +24 h
            </Button>
          )}
          {mine && !perms.canApproveHold && (
            <Button variant="secondary" onClick={() => act(() => requestExtensionAction(unit.id, 24), "Extension requested from your team lead")} disabled={pending}>
              <Timer className="h-4 w-4" /> Request +24 h
            </Button>
          )}
          {perms.canBlock && unit.status === "available" && (
            <Button variant="ghost" onClick={() => act(() => blockAction(unit.id, true, "Management block"), "Blocked")} disabled={pending}>
              <Ban className="h-4 w-4" /> Block
            </Button>
          )}
          {perms.canBlock && unit.status === "blocked" && (
            <Button variant="ghost" onClick={() => act(() => blockAction(unit.id, false), "Released to sale")} disabled={pending}>
              <Check className="h-4 w-4" /> Unblock
            </Button>
          )}
        </div>

        {booking && <BookingForm unitId={unit.id} discountPsf={discountPsf} onDone={(id) => router.push(`/app/bookings/${id}`)} />}

        {perms.canShare && (
          <div className="space-y-3 rounded-2xl border border-line p-4">
            <p className="text-sm font-semibold">Quote</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Discount (₹ PSF)">
                <Input inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ""))} placeholder="0" />
              </Field>
              <Field label="Customer name">
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional" />
              </Field>
            </div>
            {quote?.offers.length ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#7A2DB0]" checked={offer === quote.offers[0]} onChange={(e) => setOffer(e.target.checked ? quote.offers[0] : "")} />
                {OFFER_LABEL[quote.offers[0]] ?? quote.offers[0]}
              </label>
            ) : null}
            {quote?.needsApprovalFrom && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-purple/8 p-3 text-sm">
                <span>₹{discountPsf} PSF needs approval from {quote.needsApprovalFrom}.</span>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => requestDiscountAction(unit.id, discountPsf), "Approval requested")}>
                  Request
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={pending || !!quote?.needsApprovalFrom}
                onClick={() =>
                  start(async () => {
                    const r = await shareCostSheetAction(unit.id, { discountPsf, offer: offer || undefined, customerName });
                    if (r.ok) setShareUrl(r.data.path);
                    else setError(r.error);
                  })
                }
              >
                <Share2 className="h-4 w-4" /> Share link
              </Button>
              <a className={cx("inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium hover:bg-bg", quote?.needsApprovalFrom && "pointer-events-none opacity-50")} href={`/api/units/${unit.id}/cost-sheet.pdf?${discountQuery}`} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" /> PDF
              </a>
            </div>
            {absShare && (
              <div className="space-y-2 rounded-xl bg-bg p-3 text-sm">
                <p className="truncate font-mono text-xs">{absShare}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(absShare).then(() => setNotice("Link copied"))}>
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                  <a className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#25D366] px-3 text-sm font-medium text-white" href={`https://wa.me/?text=${encodeURIComponent(`Cost sheet for ${unit.number} at ${projectName}: ${absShare}`)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {quote?.internal && quote.sheet.internal && (
          <div className="rounded-2xl border border-dashed border-purple/40 bg-purple/5 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold tracking-wider text-purple uppercase">Internal · not shown to customers</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted">Closing PSF</p>
                <p className="font-semibold">{quote.sheet.internal.closingPsf ? inr(quote.sheet.internal.closingPsf) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Sourcing PSF</p>
                <p className="font-semibold">{quote.sheet.internal.sourcingPsf ? inr(quote.sheet.internal.sourcingPsf) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Quoted PSF</p>
                <p className={cx("font-semibold", quote.sheet.internal.belowClosing && "text-[#b42318]")}>{inr(quote.sheet.internal.quotedPsf)}</p>
              </div>
            </div>
            {quote.sheet.internal.belowClosing && <p className="mt-2 text-[#b42318]">Below closing price: needs leadership approval.</p>}
          </div>
        )}

        {quote ? (
          <div>
            <p className="mb-2 text-xs text-muted">Price list: {quote.priceListName}</p>
            <CostSheetView title="Cost sheet" sheet={quote.sheet} compact />
          </div>
        ) : (
          <div className="h-64 animate-pulse rounded-2xl bg-ink/5" />
        )}
      </div>
    </div>
  );
}

function BookingForm({ unitId, discountPsf, onDone }: { unitId: string; discountPsf: number; onDone: (bookingId: string) => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3 rounded-2xl border border-magenta/30 bg-magenta/5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await startStaffBookingAction(unitId, { phone, name, email, discountPsf });
          if (r.ok) onDone(r.data.bookingId);
          else setError(r.error);
        });
      }}
    >
      <p className="text-sm font-semibold">Book for a customer</p>
      <p className="text-xs text-muted">Freezes today&apos;s price and holds the unit for 24 hours while the token is paid.</p>
      <Field label="Customer mobile">
        <Input inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98450 12345" />
      </Field>
      <Field label="Customer name">
        <Input required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email (optional)" error={error}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" variant="accent" className="w-full" disabled={pending}>
        {pending ? "Creating booking…" : "Create booking"}
      </Button>
    </form>
  );
}
