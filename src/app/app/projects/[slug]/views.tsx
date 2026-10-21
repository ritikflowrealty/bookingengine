"use client";

import type { ClientUnit } from "@/lib/inventory/client-unit";
import type { Tower } from "./InventoryGrid";

export type ViewKind = "grid" | "3d" | "map";

// Placeholder until the 3D tower and master-plan components are merged in.
export function ProjectViews(props: { view: ViewKind; project: { name: string; accentColor: string | null }; towers: Tower[]; units: ClientUnit[]; focusTowerId: string | null; selectedId: string | null; onSelect: (id: string) => void; match: (u: ClientUnit) => boolean }) {
  return <div className="flex h-[60vh] items-center justify-center rounded-2xl border border-line bg-surface text-muted">{props.view === "3d" ? "3D view" : "Master plan"} coming in the next push</div>;
}
