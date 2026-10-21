"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ClientUnit } from "@/lib/inventory/client-unit";
import type { Tower } from "./InventoryGrid";
import type { PlanPlot } from "@/components/plan/MasterPlan";

export type ViewKind = "grid" | "3d" | "map";

const Loading = () => <div className="h-[70vh] animate-pulse rounded-2xl bg-ink/5" />;
const MasterPlan = dynamic(() => import("@/components/plan/MasterPlan").then((m) => m.MasterPlan), { ssr: false, loading: Loading });

type Props = { view: ViewKind; project: { name: string; accentColor: string | null }; towers: Tower[]; units: ClientUnit[]; focusTowerId: string | null; selectedId: string | null; onSelect: (id: string) => void; match: (u: ClientUnit) => boolean; dimUnavailable?: boolean; height?: string };

export function ProjectViews({ view, project, units, selectedId, onSelect, match, dimUnavailable, height = "70vh" }: Props) {
  const plots = useMemo<PlanPlot[]>(
    () => units.filter((u) => u.plan?.x !== undefined).map((u) => ({ id: u.id, number: u.number, x: u.plan!.x!, y: u.plan!.y!, status: u.status, areaSqft: Number(u.plotAreaSqft) || undefined, facing: u.facing ?? undefined, corner: u.corner, tags: u.tags, polygon: u.plan?.polygon })),
    [units],
  );
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const filter = useMemo(() => (p: PlanPlot) => match(byId.get(p.id)!), [match, byId]);
  if (view === "map") return <MasterPlan plots={plots} selectedId={selectedId} onSelect={onSelect} projectName={project.name} filter={filter} height={height} dimUnavailable={dimUnavailable} />;
  return <div className="flex h-[60vh] items-center justify-center rounded-2xl border border-line bg-surface text-muted">3D view loading…</div>;
}
