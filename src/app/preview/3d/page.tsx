"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { STATUS_LABELS, StatusLegend, type UnitStatus } from "@/components/StatusLegend";
import type { TowerSceneTower, TowerSceneUnit } from "@/components/three/TowerScene";

const TowerScene = dynamic(() => import("@/components/three/TowerScene").then((m) => m.TowerScene), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading 3D view…</div>,
});

// Sample data only: SIPANI CITY towers A, C, E, G + 21 floors, 6 units per floor.
const towers: TowerSceneTower[] = ["A", "C", "E"].map((code) => ({ id: code, name: `Tower ${code}`, code, floors: 22, unitsPerFloor: 6 }));

/** Deterministic pseudo-random status; lower floors sell first, like real launches. */
function sampleStatus(seed: string, floor: number): UnitStatus {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const r = ((h >>> 0) % 1000) / 1000 + (floor / 22) * 0.35 - 0.1;
  return r < 0.3 ? "sold" : r < 0.45 ? "booked" : r < 0.52 ? "on_hold" : r < 0.56 ? "blocked" : "available";
}

const units: TowerSceneUnit[] = towers.flatMap((t) =>
  Array.from({ length: t.floors * t.unitsPerFloor }, (_, i) => {
    const floor = Math.floor(i / t.unitsPerFloor);
    const series = (i % t.unitsPerFloor) + 1;
    const number = `${t.code}-${floor}${String(series).padStart(2, "0")}`;
    return { id: number, towerId: t.id, floor, series, number, status: sampleStatus(number, floor) };
  }),
);

export default function TowerPreview() {
  const [focus, setFocus] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = units.find((u) => u.id === selectedId);
  const counts = useMemo(() => {
    const c: Partial<Record<UnitStatus, number>> = {};
    for (const u of units) if (!focus || u.towerId === focus) c[u.status] = (c[u.status] ?? 0) + 1;
    return c;
  }, [focus]);
  const tabs = [{ id: null, label: "All" }, ...towers.map((t) => ({ id: t.id, label: t.name }))];

  return (
    <main className="flex h-dvh flex-col bg-bg lg:flex-row">
      <section className="relative flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-5 pb-3 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-magenta">Flow Inventory</p>
            <h1 className="text-2xl font-semibold tracking-tight">SIPANI CITY</h1>
          </div>
          <div role="tablist" aria-label="Tower" className="flex rounded-full bg-surface p-1 shadow-sm ring-1 ring-line">
            {tabs.map((t) => (
              <button
                key={t.label}
                role="tab"
                aria-selected={focus === t.id}
                onClick={() => setFocus(t.id)}
                className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors ${focus === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>
        <div className="relative min-h-0 flex-1">
          <TowerScene projectName="SIPANI CITY" towers={towers} units={units} focusTowerId={focus} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 sm:left-6 sm:right-auto">
            <StatusLegend counts={counts} className="pointer-events-auto rounded-2xl bg-surface/90 px-4 py-3 shadow-sm ring-1 ring-line backdrop-blur" />
          </div>
        </div>
      </section>

      <aside className="shrink-0 border-t border-line bg-surface px-4 py-4 sm:px-6 lg:w-96 lg:border-t-0 lg:border-l lg:py-8">
        <h2 className="hidden text-lg font-semibold lg:block">Selected unit</h2>
        {selected ? (
          <div className="flex items-center justify-between gap-4 lg:mt-5 lg:block">
            <div>
              <p className="font-heading text-3xl font-semibold tracking-tight">{selected.number}</p>
              <p className="mt-1 text-sm text-muted">
                {towers.find((t) => t.id === selected.towerId)?.name} · {selected.floor === 0 ? "Ground floor" : `Floor ${selected.floor}`} · Series {String(selected.series).padStart(2, "0")}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-bg px-3 py-1.5 text-sm font-medium lg:mt-5">
              <span className="size-2.5 rounded-full" style={{ background: `var(--st-${selected.status})` }} />
              {STATUS_LABELS[selected.status]}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted lg:mt-3">Tap a unit in the tower to see its details. Drag to orbit, pinch or scroll to zoom.</p>
        )}
      </aside>
    </main>
  );
}
