import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Download, ShieldCheck, Timer } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { CostSheetView } from "@/components/CostSheetView";
import { Countdown } from "@/components/Countdown";
import { ButtonLink, Card } from "@/components/ui";
import { floorLabel } from "@/lib/inventory/generate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your cost sheet · Flow Realty", robots: { index: false } };

export default async function SharedCostSheet({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const link = await db.query.shareLinks.findFirst({ where: eq(s.shareLinks.token, token) });
  if (!link) notFound();
  const unit = (await db.query.units.findFirst({ where: eq(s.units.id, link.unitId) }))!;
  const project = (await db.query.projects.findFirst({ where: eq(s.projects.id, unit.projectId) }))!;
  const tower = unit.towerId ? await db.query.towers.findFirst({ where: eq(s.towers.id, unit.towerId) }) : null;
  const expired = link.expiresAt < new Date();
  const accent = project.accentColor ?? "#7A2DB0";

  return (
    <main className="min-h-dvh pb-16">
      <header className="relative overflow-hidden bg-[#1C2033] px-5 pt-10 pb-24 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-40 blur-[90px]" style={{ background: accent }} />
        <div className="relative mx-auto max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.3em] text-[#f6a2c8]">FLOW REALTY</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-2 text-white/70">
            {unit.kind === "plot" ? `Plot ${unit.number}` : `Tower ${tower?.name} · ${unit.number} · Floor ${floorLabel(unit.floor ?? 0)}`}
            {unit.bhk || unit.typeLabel ? ` · ${unit.bhk ?? unit.typeLabel}` : ""}
          </p>
          {link.customerName && <p className="mt-6 text-lg">Prepared for {link.customerName}</p>}
        </div>
      </header>
      <div className="relative mx-auto -mt-16 max-w-3xl space-y-4 px-4">
        <Card className="flex flex-wrap items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e0a100]/15 text-[#8a6200]">
            <Timer className="h-5 w-5" />
          </span>
          <div className="flex-1">
            {expired ? (
              <p className="font-medium text-[#b42318]">This quote has expired. Ask your relationship manager for a fresh one.</p>
            ) : (
              <>
                <p className="font-medium">
                  Valid for <Countdown to={link.expiresAt} className="tabular-nums" />
                </p>
                <p className="text-sm text-muted">Prices are locked only once the booking token is paid.</p>
              </>
            )}
          </div>
          <a href={`/s/${token}/pdf`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-bg">
            <Download className="h-4 w-4" /> PDF
          </a>
          {!expired && project.publicBooking && unit.status === "available" && (
            <ButtonLink href={`/p/${project.slug}/book?unit=${unit.id}`} variant="accent">
              Book this {unit.kind === "plot" ? "plot" : "home"}
            </ButtonLink>
          )}
        </Card>
        {!expired && <CostSheetView title="Cost sheet" sheet={link.costSheet} />}
        <p className="flex items-center justify-center gap-2 pt-4 text-xs text-muted">
          <ShieldCheck className="h-4 w-4" />
          {project.reraNumbers.length ? `RERA ${project.reraNumbers.join(", ")}` : "Flow Realty"} · Prices are indicative; final terms per agreement of sale.
        </p>
      </div>
    </main>
  );
}
