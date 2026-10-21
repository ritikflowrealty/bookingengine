"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ClientUnit } from "@/lib/inventory/client-unit";
import type { Tower } from "./InventoryGrid";
import type { PlanPlot } from "@/components/plan/MasterPlan";

export type ViewKind = "grid" | "3d" | "map";

const Loading = () => <div className="h-[70vh] animate-pulse rounded-2xl bg-ink/5" />;
const TowerScene = dynamic(() => import("@/components/three/TowerScene").then((m) => m.TowerScene), { ssr: false, loading: Loading });
const MasterPlan = dynamic(() => import("@/components/plan/MasterPlan").then((m) => m.MasterPlan), { ssr: false, loading: Loading });

type Props = { view: ViewKind; project: { name: string; accentColor: string | null }; towers: Tower[]; units: ClientUnit[]; focusTowerId: string | null; selectedId: string | null; onSelect: (id: string) => void; match: (u: ClientUnit) => boolean; dimUnavailable?: boolean; height?: string };

export function ProjectViews({ view, project, towers, units, focusTowerId, selectedId, onSelect, match, dimUnavailable, height = "70vh" }: Props) {
  // TowerScene counts levels including ground (0..floors-1); our towers store the top floor number.
  const sceneTowers = useMemo(() => towers.map((t) => ({ ...t, floors: t.floors + 1 })), [towers]);
  const sceneUnits = useMemo(() => units.filter((u) => u.towerId && match(u)).map((u) => ({ id: u.id, towerId: u.towerId!, floor: u.floor ?? 0, series: u.series, number: u.number, status: u.status })), [units, match]);
  const plots = useMemo<PlanPlot[]>(
    () => units.filter((u) => u.plan?.x !== undefined).map((u) => ({ id: u.id, number: u.number, x: u.plan!.x!, y: u.plan!.y!, status: u.status, areaSqft: Number(u.plotAreaSqft) || undefined, facing: u.facing ?? undefined, corner: u.corner, tags: u.tags, polygon: u.plan?.polygon })),
    [units],
  );
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const filter = useMemo(() => (p: PlanPlot) => match(byId.get(p.id)!), [match, byId]);
  if (view === "map") return <MasterPlan plots={plots} selectedId={selectedId} onSelect={onSelect} projectName={project.name} filter={filter} height={height} dimUnavailable={dimUnavailable} />;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-[#F7F5F0]" style={{ height }}>
      <TowerScene projectName={project.name} accent={project.accentColor ?? undefined} towers={sceneTowers} units={sceneUnits} selectedId={selectedId} onSelect={onSelect} focusTowerId={focusTowerId} height="100%" />
    </div>
  );
}
