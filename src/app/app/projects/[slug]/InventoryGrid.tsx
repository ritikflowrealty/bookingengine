"use client";

import { memo } from "react";
import type { ClientUnit } from "@/lib/inventory/client-unit";
import { cx, STATUS_LABEL } from "@/components/ui";
import { floorLabel } from "@/lib/inventory/generate";

export type Tower = { id: string; name: string; code: string; floors: number; unitsPerFloor: number };

const cellStyle = (status: ClientUnit["status"], dim: boolean) =>
  status === "available"
    ? { background: `var(--st-available)`, color: "white", opacity: dim ? 0.25 : 1 }
    : { background: `color-mix(in srgb, var(--st-${status}) 18%, var(--surface))`, color: `color-mix(in srgb, var(--st-${status}) 80%, var(--ink))`, opacity: dim ? 0.25 : 1 };

/** Tower elevation grid: floors top-down, one column per series. */
export const TowerGrid = memo(function TowerGrid({ projectName, tower, units, selectedId, onSelect, match }: { projectName: string; tower: Tower; units: ClientUnit[]; selectedId?: string | null; onSelect: (id: string) => void; match: (u: ClientUnit) => boolean }) {
  const series = [...new Set(units.map((u) => u.series))].sort((a, b) => a - b);
  const floors = [...new Set(units.map((u) => u.floor ?? 0))].sort((a, b) => b - a);
  const at = new Map(units.map((u) => [`${u.floor}:${u.series}`, u]));
  const typeOf = (s: number) => units.find((u) => u.series === s)?.typeLabel ?? "";
  const available = units.filter((u) => u.status === "available").length;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">
          {projectName.toUpperCase()} <span className="text-muted">·</span> Tower {tower.name}
        </h3>
        <span className="text-sm text-muted">
          <span className="font-semibold" style={{ color: "var(--st-available)" }}>{available}</span> available
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface" />
              {series.map((s) => (
                <th key={s} className="px-1 pb-1 text-center font-medium text-muted">
                  <div className="text-ink">{String(s).padStart(2, "0")}</div>
                  <div className="truncate text-[10px] font-normal" title={typeOf(s)}>{typeOf(s)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {floors.map((f) => (
              <tr key={f}>
                <th className="sticky left-0 z-10 bg-surface pr-2 text-right font-medium text-muted tabular-nums">{floorLabel(f)}</th>
                {series.map((s) => {
                  const u = at.get(`${f}:${s}`);
                  if (!u) return <td key={s} />;
                  return (
                    <td key={s} className="p-0">
                      <button
                        onClick={() => onSelect(u.id)}
                        title={`${u.number} · ${STATUS_LABEL[u.status]} · ${u.typeLabel ?? ""}`}
                        aria-label={`${u.number}, ${STATUS_LABEL[u.status]}`}
                        className={cx("h-9 w-full min-w-[56px] rounded-lg font-medium tabular-nums transition hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-purple", selectedId === u.id && "ring-2 ring-magenta ring-offset-2 ring-offset-surface")}
                        style={cellStyle(u.status, !match(u))}
                      >
                        {u.number.split("-").pop()}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});

/** Plot tiles for plotted projects (list alternative to the master-plan map). */
export const PlotGrid = memo(function PlotGrid({ units, selectedId, onSelect, match }: { units: ClientUnit[]; selectedId?: string | null; onSelect: (id: string) => void; match: (u: ClientUnit) => boolean }) {
  const sorted = [...units].sort((a, b) => Number(a.number) - Number(b.number) || a.number.localeCompare(b.number));
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
        {sorted.map((u) => (
          <button
            key={u.id}
            onClick={() => onSelect(u.id)}
            aria-label={`Plot ${u.number}, ${STATUS_LABEL[u.status]}`}
            className={cx("rounded-lg px-2 py-2 text-left transition hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-purple", selectedId === u.id && "ring-2 ring-magenta ring-offset-2 ring-offset-surface")}
            style={cellStyle(u.status, !match(u))}
          >
            <div className="text-sm font-semibold tabular-nums">{u.number}</div>
            <div className="text-[10px] opacity-80 tabular-nums">{Math.round(Number(u.plotAreaSqft ?? 0)).toLocaleString("en-IN")} sft</div>
          </button>
        ))}
      </div>
    </section>
  );
});
