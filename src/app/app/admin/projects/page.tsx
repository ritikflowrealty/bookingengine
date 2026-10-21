import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { ChevronRight, Plus } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { humanize, PROJECT_TYPE_LABEL } from "@/lib/admin/shared";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { TableCard, td, th } from "../_components/blocks";

export default async function AdminProjects() {
  await requireAdmin();
  const db = await getDb();
  const [projects, devs, counts, lists] = await Promise.all([
    db.query.projects.findMany({ orderBy: asc(s.projects.name) }),
    db.query.developers.findMany(),
    db.select({ projectId: s.units.projectId, n: sql<number>`count(*)::int` }).from(s.units).groupBy(s.units.projectId),
    db.query.priceLists.findMany({ where: eq(s.priceLists.status, "active") }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Projects" subtitle="Details, integrations, structure, units and pricing for each project." actions={<ButtonLink href="/app/admin/projects/new"><Plus className="h-4 w-4" /> New project</ButtonLink>} />
      {projects.length === 0 ? (
        <EmptyState title="No projects yet">Create the first project, then add towers or import plots.</EmptyState>
      ) : (
        <TableCard>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr>
                <th className={th}>Project</th>
                <th className={th}>Type</th>
                <th className={th}>Units</th>
                <th className={th}>Live price list</th>
                <th className={th}>Booking</th>
                <th className={th}>Status</th>
                <th className={th} aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const list = lists.find((l) => l.projectId === p.id);
                return (
                  <tr key={p.id} className="group hover:bg-bg/60">
                    <td className={td}>
                      <Link href={`/app/admin/projects/${p.id}`} className="flex items-center gap-3">
                        <span className="h-9 w-1.5 rounded-full" style={{ background: p.accentColor ?? "var(--purple)" }} />
                        <span>
                          <span className="block font-semibold group-hover:text-purple">{p.name}</span>
                          <span className="block text-xs text-muted">{devs.find((d) => d.id === p.developerId)?.name} · {p.city ?? "—"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={td}>{PROJECT_TYPE_LABEL[p.type]}</td>
                    <td className={`${td} tabular-nums`}>{(counts.find((c) => c.projectId === p.id)?.n ?? 0).toLocaleString("en-IN")}</td>
                    <td className={td}>{list ? <span>{list.name} <span className="text-muted">v{list.version}</span></span> : <Badge tone="amber">None</Badge>}</td>
                    <td className={td}>{p.publicBooking ? <Badge tone="green">Public</Badge> : <Badge>Staff only</Badge>}</td>
                    <td className={td}><Badge tone={p.status === "active" ? "purple" : "neutral"}>{humanize(p.status)}</Badge></td>
                    <td className={`${td} text-right`}>
                      <Link href={`/app/admin/projects/${p.id}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink" aria-label={`Edit ${p.name}`}>
                        <ChevronRight className="h-5 w-5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}
