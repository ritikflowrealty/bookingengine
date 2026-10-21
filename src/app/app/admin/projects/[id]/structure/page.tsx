import { asc, eq, inArray, sql } from "drizzle-orm";
import { FileUp, LayoutGrid } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { formatAttrs } from "@/lib/admin/units";
import type { TowerStyle } from "@/lib/admin/units-db";
import { ButtonLink, Card, Stat } from "@/components/ui";
import { adminProject } from "../../data";
import { StructureEditor, type TowerDraft } from "./StructureEditor";

const n = (v: string | null) => (v === null ? undefined : Number(v));

export default async function StructurePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { project } = await adminProject(id);
  const db = await getDb();
  const base = `/app/admin/projects/${id}`;

  if (project.type === "plotted") {
    const [plots, mapped] = await Promise.all([db.$count(s.units, eq(s.units.projectId, id)), db.$count(s.units, sql`${s.units.projectId} = ${id} and ${s.units.plan} is not null`)]);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:max-w-2xl">
          <Stat label="Plots" value={plots.toLocaleString("en-IN")} accent="var(--purple)" />
          <Stat label="On the master plan" value={mapped.toLocaleString("en-IN")} accent="var(--royal)" hint="Plots with X% / Y% positions" />
        </div>
        <Card className="p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Plots are edited as a list</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Plotted projects have no towers. Add or update plots in the bulk editor, or import the developer&apos;s area statement (S.NO, Area in SQFT / SQM, Type, Facing, Avenue, Corner, premium charges, X% / Y%).</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={`${base}/units`}><LayoutGrid className="h-4 w-4" /> Open bulk editor</ButtonLink>
            <ButtonLink href={`${base}/units?import=1`} variant="secondary"><FileUp className="h-4 w-4" /> Import CSV / XLSX</ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  const towers = await db.query.towers.findMany({ where: eq(s.towers.projectId, id), orderBy: asc(s.towers.name) });
  const ids = towers.map((t) => t.id);
  const [series, counts] = ids.length
    ? await Promise.all([
        db.query.unitSeries.findMany({ where: inArray(s.unitSeries.towerId, ids), orderBy: asc(s.unitSeries.series) }),
        db.select({ towerId: s.units.towerId, n: sql<number>`count(*)::int` }).from(s.units).where(inArray(s.units.towerId, ids)).groupBy(s.units.towerId),
      ])
    : [[], []];

  const drafts: TowerDraft[] = towers.map((t) => {
    const style = (t.style ?? {}) as TowerStyle;
    return {
      id: t.id,
      unitCount: counts.find((c) => c.towerId === t.id)?.n ?? 0,
      name: t.name,
      code: t.code,
      floors: t.floors,
      startFloor: style.startFloor ?? 0,
      basements: t.basements,
      unitsPerFloor: t.unitsPerFloor,
      unitNumberFormat: t.unitNumberFormat,
      series: series
        .filter((r) => r.towerId === t.id)
        .map((r) => {
          const x = style.series?.[r.series] ?? {};
          return { key: r.id, series: r.series, bhk: r.bhk ?? "", typeLabel: r.typeLabel ?? "", description: r.description ?? "", facing: r.facing ?? "", direction: r.direction ?? "", view: r.view ?? "", tier: r.tier ?? "", carpet: n(r.carpet), balcony: n(r.balcony), sbua: n(r.sbua), uds: n(r.uds), corner: !!x.corner, tags: (x.tags ?? []).join(", "), attrs: formatAttrs(x.priceAttrs ?? {}) };
        }),
    };
  });

  return <StructureEditor projectId={id} initial={drafts} />;
}
