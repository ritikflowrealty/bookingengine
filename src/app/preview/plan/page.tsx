"use client";

import { useState } from "react";
import { MousePointerClick, X } from "lucide-react";
import raw from "@/db/seed-data/riverine-plots.json";
import { MasterPlan, STATUS_KEYS, STATUS_LABEL, formatFacing, formatSqft, type PlanPlot, type PlotStatus } from "@/components/plan/MasterPlan";
import { PlanFilters } from "@/components/plan/PlanFilters";

type RawPlot = (typeof raw)[number];

const plots: PlanPlot[] = raw.map((r) => ({
  id: r.no,
  number: r.no,
  x: r.x,
  y: r.y,
  status: r.status as PlotStatus,
  areaSqft: r.sqft,
  facing: r.facing,
  corner: r.corner,
  tags: r.premium ? [r.premium] : [],
}));
const rawById = new Map(raw.map((r) => [r.no, r]));
const counts = Object.fromEntries(STATUS_KEYS.map((k) => [k, plots.filter((p) => p.status === k).length])) as Record<PlotStatus, number>;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg px-3 py-2.5 lg:px-3.5 lg:py-3">
      <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div className="mt-0.5 font-medium text-ink">{value}</div>
    </div>
  );
}

function PlotDetails({ r }: { r: RawPlot }) {
  const status = r.status as PlotStatus;
  const premiums = [
    { label: `${formatFacing(r.facing)} facing`, psf: r.facingPsf },
    { label: "Park facing", psf: r.parkPsf },
    { label: "Corner", psf: r.cornerPsf },
  ].filter((x) => x.psf > 0);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">The Riverine</div>
          <h2 className="mt-1 text-3xl font-semibold text-ink">Plot {r.no}</h2>
        </div>
        <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-bg px-3 py-1.5 text-sm font-medium text-ink">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--st-" + status + ")" }} />
          {STATUS_LABEL[status]}
        </span>
      </div>
      {(r.corner || r.premium) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.corner && <span className="rounded-full bg-[#F38A3F]/15 px-3 py-1 text-sm font-medium text-[#B85E1E]">Corner plot</span>}
          {r.premium && <span className="rounded-full bg-purple/10 px-3 py-1 text-sm font-medium text-purple">{r.premium}</span>}
        </div>
      )}
      <div className="mt-5 grid grid-cols-3 gap-2 lg:grid-cols-2 lg:gap-2.5">
        <Fact label="Area" value={`${formatSqft(r.sqft)} sq ft`} />
        <Fact label="Area (sq m)" value={r.sqm.toLocaleString("en-IN")} />
        <Fact label="Facing" value={formatFacing(r.facing)} />
        <Fact label="Type" value={r.type} />
        <Fact label="Avenue" value={r.avenue} />
        <Fact label="Corner" value={r.corner ? "Yes" : "No"} />
      </div>
      {premiums.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Location premiums</div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {premiums.map((p) => (
              <li key={p.label} className="flex justify-between py-2">
                <span>{p.label}</span>
                <span className="tabular-nums">₹{p.psf.toLocaleString("en-IN")} / sq ft</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {status === "blocked" && r.blocked && <p className="mt-4 rounded-xl bg-bg px-3.5 py-3 text-sm text-muted">{r.blocked}</p>}
    </div>
  );
}

export default function PlanPreview() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<((p: PlanPlot) => boolean) | undefined>();
  const selected = selectedId ? rawById.get(selectedId) : undefined;
  const matching = filter ? plots.filter(filter).length : plots.length;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.2em] text-magenta uppercase">Flow Realty · Mysuru</div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">THE RIVERINE · Master plan</h1>
        </div>
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{counts.available}</span> of {plots.length} plots available
        </p>
      </header>

      <div className="mt-5">
        {/* Wrap: a bare function passed to setState would be treated as an updater. */}
        <PlanFilters onChange={(f) => setFilter(() => f)} />
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <MasterPlan plots={plots} selectedId={selectedId} onSelect={setSelectedId} filter={filter} projectName="The Riverine" height="70vh" />
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {STATUS_KEYS.map((key) => (
              <span key={key} className="inline-flex items-center gap-2 text-ink">
                <span className="h-3 w-3 rounded-full" style={{ background: "var(--st-" + key + ")" }} />
                {STATUS_LABEL[key]}
                <span className="text-muted tabular-nums">{counts[key]}</span>
              </span>
            ))}
            {filter && <span className="text-muted sm:ml-auto">{matching} plots match filters</span>}
          </div>
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
            {selected ? (
              <PlotDetails r={selected} />
            ) : (
              <div className="py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-bg">
                  <MousePointerClick className="h-6 w-6 text-purple" />
                </div>
                <p className="mt-4 font-heading text-lg font-semibold text-ink">Pick a plot</p>
                <p className="mx-auto mt-1 max-w-[16rem] text-sm text-muted">Tap any plot on the master plan to see its size, facing and premiums.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 max-h-[60vh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(28,32,51,0.15)] lg:hidden">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setSelectedId(null)}
            className="absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg"
          >
            <X className="h-5 w-5" />
          </button>
          <PlotDetails r={selected} />
        </div>
      )}
    </main>
  );
}
