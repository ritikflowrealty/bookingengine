"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Box, Grid3x3, Lock, Map as MapIcon, X } from "lucide-react";
import type { ClientUnit } from "@/lib/inventory/client-unit";
import type { CostSheet } from "@/lib/pricing/engine";
import { Badge, Button, cx, STATUS_LABEL, StatusDot, type Status } from "@/components/ui";
import { CostSheetView } from "@/components/CostSheetView";
import { PlotGrid, TowerGrid, type Tower } from "@/app/app/projects/[slug]/InventoryGrid";
import { ProjectViews, type ViewKind } from "@/app/app/projects/[slug]/views";
import { floorLabel } from "@/lib/inventory/generate";
import { customerQuoteAction, startCustomerBookingAction } from "@/app/actions/customer";
import { formatINR } from "@/lib/format";

type Quote = { sheet: Omit<CostSheet, "internal">; available: boolean; tokenAmount: number; holdMinutes: number };

export function Picker({ project, towers, initialUnits, kiosk, preselect }: { project: { slug: string; name: string; type: string; accentColor: string | null }; towers: Tower[]; initialUnits: ClientUnit[]; kiosk: boolean; preselect?: string | null }) {
  const router = useRouter();
  const plotted = project.type === "plotted";
  const [units, setUnits] = useState(initialUnits);
  const [view, setView] = useState<ViewKind>(plotted ? "map" : "3d");
  const [towerId, setTowerId] = useState<string | null>(towers[0]?.id ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(preselect ?? null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch(`/api/p/${project.slug}/inventory`, { cache: "no-store" });
      if (r.status === 401) return router.refresh();
      if (r.ok) setUnits(((await r.json()) as { units: ClientUnit[] }).units);
    }, 5000);
    return () => clearInterval(t);
  }, [project.slug, router]);

  const selected = units.find((u) => u.id === selectedId) ?? null;
  useEffect(() => {
    setQuote(null);
    setError(null);
    if (!selectedId) return;
    let live = true;
    customerQuoteAction(project.slug, selectedId).then((r) => live && (r.ok ? setQuote(r.data) : setError(r.error)));
    return () => {
      live = false;
    };
  }, [selectedId, project.slug]);

  const onSelect = useCallback(
    (id: string) => {
      const u = units.find((x) => x.id === id);
      if (u && u.status !== "available") {
        setError(`${plotted ? "Plot" : "Unit"} ${u.number} is ${STATUS_LABEL[u.status].toLowerCase()}. Please pick a green one.`);
        setSelectedId(null);
        return;
      }
      setSelectedId(id);
    },
    [units, plotted],
  );
  const all = useCallback(() => true, []);
  const counts = useMemo(() => units.reduce<Partial<Record<Status, number>>>((c, u) => ((c[u.status] = (c[u.status] ?? 0) + 1), c), {}), [units]);
  const tower = towers.find((t) => t.id === towerId);
  const views: { k: ViewKind; label: string; icon: typeof Box }[] = plotted
    ? [
        { k: "map", label: "Master plan", icon: MapIcon },
        { k: "grid", label: "List", icon: Grid3x3 },
      ]
    : [
        { k: "3d", label: "3D", icon: Box },
        { k: "grid", label: "Floors", icon: Grid3x3 },
      ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line bg-surface p-1">
            {views.map(({ k, label, icon: Icon }) => (
              <button key={k} onClick={() => setView(k)} className={cx("flex items-center gap-2 rounded-lg font-medium transition", kiosk ? "px-5 py-3 text-base" : "px-3.5 py-2 text-sm", view === k ? "bg-ink text-white" : "text-muted")}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {!plotted &&
            towers.map((t) => {
              const n = units.filter((u) => u.towerId === t.id && u.status === "available").length;
              return (
                <button key={t.id} onClick={() => setTowerId(t.id)} className={cx("rounded-xl border font-medium transition", kiosk ? "px-5 py-3 text-base" : "px-4 py-2 text-sm", towerId === t.id ? "border-purple bg-purple text-white" : "border-line bg-surface")}>
                  Tower {t.name} <span className={towerId === t.id ? "text-white/70" : "text-muted"}>· {n} free</span>
                </button>
              );
            })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {(Object.keys(STATUS_LABEL) as Status[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-muted">
              <StatusDot status={k} /> {STATUS_LABEL[k]} {k === "available" && <b className="text-ink">{counts.available ?? 0}</b>}
            </span>
          ))}
        </div>
        {error && (
          <p className="flex items-center justify-between rounded-xl bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]">
            {error}
            <button onClick={() => setError(null)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </p>
        )}
        {view === "grid" ? (
          plotted ? (
            <PlotGrid units={units} selectedId={selectedId} onSelect={onSelect} match={(u) => u.status === "available"} />
          ) : (
            tower && <TowerGrid projectName={project.name} tower={tower} units={units.filter((u) => u.towerId === tower.id)} selectedId={selectedId} onSelect={onSelect} match={(u) => u.status === "available"} />
          )
        ) : (
          <ProjectViews view={view} project={project} towers={towers} units={units} focusTowerId={towerId} selectedId={selectedId} onSelect={onSelect} match={all} dimUnavailable height={kiosk ? "72vh" : "64vh"} />
        )}
      </div>

      <aside className={cx("lg:sticky lg:top-6 lg:block lg:self-start", selected ? "fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface shadow-2xl lg:static lg:max-h-none lg:rounded-2xl lg:border lg:shadow-none" : "hidden")}>
        {selected ? (
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">{project.name}</p>
                <h2 className="mt-1 text-3xl font-semibold">{plotted ? `Plot ${selected.number}` : selected.number}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!plotted && <Badge>Floor {floorLabel(selected.floor ?? 0)}</Badge>}
                  {(selected.bhk || selected.typeLabel) && <Badge tone="purple">{selected.bhk ?? selected.typeLabel}</Badge>}
                  {selected.facing && <Badge>{selected.facing} facing</Badge>}
                  {selected.corner && <Badge tone="magenta">Corner</Badge>}
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} className="rounded-full p-2 text-muted hover:bg-ink/5" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {quote ? (
              <>
                <div className="mt-5">
                  <CostSheetView title="Your price" sheet={quote.sheet} compact />
                </div>
                <div className="sticky bottom-0 -mx-5 mt-4 border-t border-line bg-surface px-5 pt-4 pb-2 sm:-mx-6 sm:px-6">
                  <Button
                    variant="accent"
                    size={kiosk ? "xl" : "lg"}
                    className="w-full"
                    disabled={pending || !quote.available}
                    onClick={() =>
                      start(async () => {
                        const r = await startCustomerBookingAction(project.slug, selected.id);
                        if (r.ok) router.replace(`?booking=${r.data.bookingId}`);
                        else setError(r.error);
                      })
                    }
                  >
                    <Lock className="h-5 w-5" /> {pending ? "Reserving…" : `Reserve & pay ${formatINR(quote.tokenAmount)}`}
                  </Button>
                  <p className="mt-2 text-center text-xs text-muted">We hold it just for you for {quote.holdMinutes} minutes while you pay the booking token.</p>
                </div>
              </>
            ) : (
              <div className="mt-5 h-72 animate-pulse rounded-2xl bg-ink/5" />
            )}
          </div>
        ) : null}
      </aside>
      {!selected && (
        <div className="hidden rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted lg:block lg:self-start">
          Tap a <b style={{ color: "var(--st-available)" }}>green</b> {plotted ? "plot" : "home"} to see its price and reserve it.
        </div>
      )}
    </div>
  );
}
