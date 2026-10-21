"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Grid3x3, Map as MapIcon, Search } from "lucide-react";
import type { ClientUnit } from "@/lib/inventory/client-unit";
import { cx, Input, Select, STATUS_LABEL, StatusDot, type Status } from "@/components/ui";
import { PlotGrid, TowerGrid, type Tower } from "./InventoryGrid";
import { UnitPanel, type Perms } from "./UnitPanel";
import { ProjectViews, type ViewKind } from "./views";

const POLL_MS = 5000;

export function Workspace({ project, towers, initialUnits, perms }: { project: { id: string; name: string; type: string; accentColor: string | null }; towers: Tower[]; initialUnits: ClientUnit[]; perms: Perms }) {
  const router = useRouter();
  const params = useSearchParams();
  const plotted = project.type === "plotted";
  const [units, setUnits] = useState(initialUnits);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(params.get("unit"));
  const [view, setView] = useState<ViewKind>(plotted ? "map" : "grid");
  const [towerId, setTowerId] = useState<string | "all">("all");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [type, setType] = useState("");
  const [facing, setFacing] = useState("");
  const [q, setQ] = useState("");

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/projects/${project.id}/inventory`, { cache: "no-store" });
    if (r.status === 403) return router.refresh();
    if (!r.ok) return;
    const data = (await r.json()) as { units: ClientUnit[] };
    setUnits(data.units);
    setUpdatedAt(Date.now());
  }, [project.id, router]);

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("unit", id);
    else url.searchParams.delete("unit");
    window.history.replaceState(null, "", url);
  }, []);

  const types = useMemo(() => [...new Set(units.map((u) => (plotted ? u.typeLabel : u.bhk) ?? "").filter(Boolean))].sort(), [units, plotted]);
  const facings = useMemo(() => [...new Set(units.map((u) => u.facing ?? "").filter(Boolean))].sort(), [units]);
  const match = useCallback(
    (u: ClientUnit) =>
      (!statuses.length || statuses.includes(u.status)) &&
      (!type || (plotted ? u.typeLabel : u.bhk) === type) &&
      (!facing || u.facing === facing) &&
      (!q || u.number.toLowerCase().includes(q.toLowerCase())),
    [statuses, type, facing, q, plotted],
  );
  const counts = useMemo(() => units.reduce<Partial<Record<Status, number>>>((c, u) => ((c[u.status] = (c[u.status] ?? 0) + 1), c), {}), [units]);
  const selected = units.find((u) => u.id === selectedId) ?? null;
  const shownTowers = towerId === "all" ? towers : towers.filter((t) => t.id === towerId);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ago = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));

  const viewOptions: { k: ViewKind; label: string; icon: typeof Grid3x3 }[] = plotted
    ? [
        { k: "map", label: "Master plan", icon: MapIcon },
        { k: "grid", label: "List", icon: Grid3x3 },
      ]
    : [
        { k: "grid", label: "Grid", icon: Grid3x3 },
        { k: "3d", label: "3D", icon: Box },
      ];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-line bg-surface p-1">
            {viewOptions.map(({ k, label, icon: Icon }) => (
              <button key={k} onClick={() => setView(k)} className={cx("flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition", view === k ? "bg-ink text-white shadow-sm" : "text-muted hover:text-ink")}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {!plotted && towers.length > 1 && (
            <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
              {[{ id: "all", name: "All" }, ...towers].map((t) => (
                <button key={t.id} onClick={() => setTowerId(t.id)} className={cx("rounded-lg px-3 py-2 text-sm font-medium transition", towerId === t.id ? "bg-purple text-white" : "text-muted hover:text-ink")}>
                  {t.id === "all" ? "All towers" : `Tower ${t.name}`}
                </button>
              ))}
            </div>
          )}
          <span className="ml-auto flex items-center gap-2 text-xs text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2e9e5b] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2e9e5b]" />
            </span>
            Live · {ago < 2 ? "just now" : `${ago}s ago`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(STATUS_LABEL) as Status[]).map((k) => {
            const on = statuses.includes(k);
            return (
              <button key={k} onClick={() => setStatuses((s) => (on ? s.filter((x) => x !== k) : [...s, k]))} className={cx("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition", on ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink/30")}>
                <StatusDot status={k} />
                {STATUS_LABEL[k]}
                <span className={cx("tabular-nums", on ? "text-white/70" : "text-muted")}>{counts[k] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_180px_180px]">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={plotted ? "Search plot number" : "Search unit e.g. C-1401"} className="pl-11" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Select value={facing} onChange={(e) => setFacing(e.target.value)} aria-label="Facing">
            <option value="">Any facing</option>
            {facings.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>

        {view === "grid" ? (
          plotted ? (
            <PlotGrid units={units} selectedId={selectedId} onSelect={select} match={match} />
          ) : (
            <div className="space-y-4">
              {shownTowers.map((t) => (
                <TowerGrid key={t.id} projectName={project.name} tower={t} units={units.filter((u) => u.towerId === t.id)} selectedId={selectedId} onSelect={select} match={match} />
              ))}
            </div>
          )
        ) : (
          <ProjectViews view={view} project={project} towers={towers} units={units} focusTowerId={towerId === "all" ? null : towerId} selectedId={selectedId} onSelect={select} match={match} />
        )}
      </div>

      {/* Desktop: sticky side panel. Phone/tablet: full-height sheet over the grid. */}
      <aside className={cx("xl:sticky xl:top-6 xl:block xl:h-[calc(100dvh-3rem)] xl:overflow-hidden xl:rounded-2xl xl:border xl:border-line xl:bg-surface", selected ? "fixed inset-0 z-50 bg-surface xl:static xl:z-auto" : "hidden")}>
        {selected ? (
          <UnitPanel unit={selected} towerName={towers.find((t) => t.id === selected.towerId)?.name} projectName={project.name} perms={perms} onClose={() => select(null)} onChanged={refresh} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="grid grid-cols-3 gap-1.5 opacity-80">
              {["available", "booked", "available", "sold", "available", "on_hold", "available", "blocked", "available"].map((s, i) => (
                <span key={i} className="h-6 w-6 rounded-md" style={{ background: `var(--st-${s})` }} />
              ))}
            </div>
            <p className="mt-2 font-medium">Select a {plotted ? "plot" : "unit"}</p>
            <p className="max-w-xs text-sm text-muted">See its details and live cost sheet, hold it for a customer, share a quote or start a booking.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
