import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Check } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { Badge, Card, cx, PageHeader } from "@/components/ui";
import { CostSheetView } from "@/components/CostSheetView";
import { Countdown } from "@/components/Countdown";
import { BOOKING_LABEL, BOOKING_STEPS, bookingTone } from "@/lib/booking/labels";
import { formatINR } from "@/lib/format";
import { BookingActions } from "./BookingActions";
import { signedKycUrl } from "@/lib/kyc";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const db = await getDb();
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, id) });
  if (!b) notFound();
  const project = (await db.query.projects.findFirst({ where: eq(s.projects.id, b.projectId) }))!;
  if (!can(user.actor, "booking.view", { projectId: project.id, developerId: project.developerId })) notFound();
  const [unit, customer, payments, docs, approvals, history] = await Promise.all([
    db.query.units.findFirst({ where: eq(s.units.id, b.unitId) }),
    b.customerId ? db.query.customers.findFirst({ where: eq(s.customers.id, b.customerId) }) : null,
    db.query.payments.findMany({ where: eq(s.payments.bookingId, id), orderBy: desc(s.payments.createdAt) }),
    db.query.kycDocuments.findMany({ where: eq(s.kycDocuments.bookingId, id), columns: { content: false } }),
    db.query.approvals.findMany({ where: eq(s.approvals.bookingId, id), orderBy: desc(s.approvals.createdAt) }),
    db.query.auditLog.findMany({ where: (a, { and, eq: e }) => and(e(a.entity, "booking"), e(a.entityId, id)), orderBy: desc(s.auditLog.at), limit: 20 }),
  ]);
  const stepIndex = BOOKING_STEPS.indexOf(b.status);
  const paid = payments.filter((p) => p.status === "success").reduce((a, p) => a + Number(p.amount), 0);
  const bookingLink = `/p/${project.slug}/book?booking=${b.id}`;
  const form = (customer?.kyc ?? {}) as Record<string, unknown>;

  return (
    <>
      <Link href="/app/bookings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Bookings
      </Link>
      <PageHeader eyebrow={project.name} title={`${unit?.kind === "plot" ? "Plot " : ""}${unit?.number} · ${customer?.name ?? "Customer"}`} subtitle={`${customer?.phone ?? ""}${customer?.email ? ` · ${customer.email}` : ""}`} actions={<Badge tone={bookingTone(b.status)}>{BOOKING_LABEL[b.status]}</Badge>} />

      {b.status !== "cancelled" && (
        <Card className="mb-6 overflow-x-auto p-5">
          <ol className="flex min-w-[640px] items-center">
            {BOOKING_STEPS.map((st, i) => (
              <li key={st} className="flex flex-1 items-center gap-2">
                <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i < stepIndex ? "bg-purple text-white" : i === stepIndex ? "bg-magenta text-white ring-4 ring-magenta/15" : "bg-ink/5 text-muted")}>{i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}</span>
                <span className={cx("text-xs", i <= stepIndex ? "font-medium" : "text-muted")}>{BOOKING_LABEL[st].split(" ·")[0]}</span>
                {i < BOOKING_STEPS.length - 1 && <span className={cx("mx-2 h-px flex-1", i < stepIndex ? "bg-purple" : "bg-line")} />}
              </li>
            ))}
          </ol>
          {b.status === "held" && unit?.holdExpiresAt && (
            <p className="mt-4 text-sm text-[#8a6200]">
              Unit held for this booking · releases in <Countdown to={unit.holdExpiresAt} className="font-semibold" />
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-8">
            <CostSheetView title="Frozen cost sheet" sheet={b.costSheet} compact />
            {Number(b.discountPsf) > 0 && <p className="mt-3 text-sm text-muted">Includes a discount of ₹{Number(b.discountPsf)} PSF.</p>}
          </Card>
          {Object.keys(form).length > 0 && (
            <Card className="p-5 sm:p-8">
              <h2 className="text-base font-semibold">Booking form</h2>
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {Object.entries(form)
                  .filter(([, v]) => typeof v === "string" && v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted capitalize">{k.replace(/([A-Z])/g, " $1")}</dt>
                      <dd className="font-medium">{String(v)}</dd>
                    </div>
                  ))}
              </dl>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold">Token</h2>
            <p className="mt-2 font-heading text-3xl font-semibold tabular-nums">{formatINR(Number(b.tokenAmount))}</p>
            <p className="text-sm text-muted">{paid >= Number(b.tokenAmount) ? "Paid" : `Received ${formatINR(paid)}`}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <span className="truncate text-muted">{p.txnId}</span>
                  <span className={p.status === "success" ? "text-[#1f6f40]" : "text-muted"}>
                    {formatINR(Number(p.amount))} · {p.status}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <BookingActions
            bookingId={b.id}
            status={b.status}
            kycStatus={b.kycStatus}
            bookingLink={bookingLink}
            tokenAmount={Number(b.tokenAmount)}
            docs={docs.map((d) => ({ id: d.id, type: d.type, name: d.storageKey, url: signedKycUrl(d.id), verified: !!d.verifiedAt }))}
            pendingCancellation={approvals.some((a) => a.type === "cancellation" && a.status === "pending")}
          />
          <Card className="p-5">
            <h2 className="text-base font-semibold">History</h2>
            <ol className="mt-3 space-y-3 border-l border-line pl-4 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <p className="font-medium">{h.action.replace("booking.", "").replace("_", " ")}</p>
                  <p className="text-xs text-muted">{h.at.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} · {h.actorType}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
