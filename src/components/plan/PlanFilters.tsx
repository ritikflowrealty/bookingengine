"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { STATUS_COLOR, STATUS_KEYS, STATUS_LABEL, type PlanPlot, type PlotStatus } from "./MasterPlan";

export type PlanFilterState = {
  statuses: PlotStatus[];
  facing: "" | "East" | "West" | "North" | "South";
  size: "" | "s" | "m" | "l" | "xl";
  corner: boolean;
  park: boolean;
  riverside: boolean;
};

const EMPTY: PlanFilterState = { statuses: [], facing: "", size: "", corner: false, park: false, riverside: false };
const FACINGS = ["East", "West", "North", "South"] as const;
const SIZES = [
  { key: "s", label: "≤ 1,200", min: 0, max: 1200 },
  { key: "m", label: "1,200–1,800", min: 1200, max: 1800 },
  { key: "l", label: "1,800–2,400", min: 1800, max: 2400 },
  { key: "xl", label: "> 2,400", min: 2400, max: Infinity },
] as const;

const tagged = (p: PlanPlot, t: string) => !!p.tags?.some((x) => x.toLowerCase() === t);

/** Builds the plot predicate for a filter state; undefined when nothing is filtered. */
export function planPredicate(f: PlanFilterState): ((p: PlanPlot) => boolean) | undefined {
  const band = SIZES.find((s) => s.key === f.size);
  if (!f.statuses.length && !f.facing && !band && !f.corner && !f.park && !f.riverside) return undefined;
  return (p) =>
    (!f.statuses.length || f.statuses.includes(p.status)) &&
    (!f.facing || !!p.facing?.includes(f.facing)) && // "North - East" counts as North and East
    (!band || (p.areaSqft != null && p.areaSqft > band.min && p.areaSqft <= band.max)) &&
    (!f.corner || !!p.corner) &&
    (!f.park || tagged(p, "park")) &&
    (!f.riverside || tagged(p, "riverside"));
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple ${
        active ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:border-muted/40"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-14 shrink-0 text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div className="-my-1 flex gap-2 overflow-x-auto py-1 [scrollbar-width:none]">{children}</div>
    </div>
  );
}

/** Filter bar for the master plan. Calls onChange with a predicate (or undefined when cleared). */
export function PlanFilters({ onChange }: { onChange: (filter: ((p: PlanPlot) => boolean) | undefined) => void }) {
  const [f, setF] = useState<PlanFilterState>(EMPTY);
  const set = (patch: Partial<PlanFilterState>) => {
    const next = { ...f, ...patch };
    setF(next);
    onChange(planPredicate(next));
  };
  const active = planPredicate(f) !== undefined;

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <Row label="Status">
        {STATUS_KEYS.map((k) => (
          <Chip
            key={k}
            active={f.statuses.includes(k)}
            onClick={() => set({ statuses: f.statuses.includes(k) ? f.statuses.filter((s) => s !== k) : [...f.statuses, k] })}
          >
            <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/70" style={{ background: STATUS_COLOR[k] }} />
            {STATUS_LABEL[k]}
          </Chip>
        ))}
      </Row>
      <Row label="Facing">
        <Chip active={!f.facing} onClick={() => set({ facing: "" })}>
          Any
        </Chip>
        {FACINGS.map((k) => (
          <Chip key={k} active={f.facing === k} onClick={() => set({ facing: f.facing === k ? "" : k })}>
            {k}
          </Chip>
        ))}
      </Row>
      <Row label="Sq ft">
        <Chip active={!f.size} onClick={() => set({ size: "" })}>
          Any
        </Chip>
        {SIZES.map((s) => (
          <Chip key={s.key} active={f.size === s.key} onClick={() => set({ size: f.size === s.key ? "" : s.key })}>
            {s.label}
          </Chip>
        ))}
      </Row>
      <Row label="Extras">
        <Chip active={f.corner} onClick={() => set({ corner: !f.corner })}>
          Corner
        </Chip>
        <Chip active={f.park} onClick={() => set({ park: !f.park })}>
          Park facing
        </Chip>
        <Chip active={f.riverside} onClick={() => set({ riverside: !f.riverside })}>
          Riverside
        </Chip>
        {active && (
          <button
            type="button"
            onClick={() => set(EMPTY)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-magenta hover:bg-magenta/5 focus-visible:outline-2 focus-visible:outline-purple"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </Row>
    </div>
  );
}
