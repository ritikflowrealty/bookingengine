import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, Building2, FileSpreadsheet, LayoutGrid, Users } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { formatDateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";

export default async function AdminOverview() {
  await requireAdmin();
  const db = await getDb();
  const [projects, units, users, activeLists, recent] = await Promise.all([
    db.$count(s.projects),
    db.$count(s.units),
    db.$count(s.users, eq(s.users.active, true)),
    db.$count(s.priceLists, eq(s.priceLists.status, "active")),
    db.select({ id: s.auditLog.id, action: s.auditLog.action, entity: s.auditLog.entity, at: s.auditLog.at, actorType: s.auditLog.actorType, actor: s.users.name }).from(s.auditLog).leftJoin(s.users, eq(s.users.id, s.auditLog.actorId)).orderBy(desc(s.auditLog.id)).limit(8),
  ]);
  const tiles = [
    { href: "/app/admin/projects", label: "Projects", value: projects, hint: "Details, integrations, limits", icon: Building2, tone: "#7A2DB0" },
    { href: "/app/admin/projects", label: "Units", value: units, hint: "Structure, bulk edit, import", icon: LayoutGrid, tone: "#3D5FD9" },
    { href: "/app/admin/users", label: "Active users", value: users, hint: "Roles, teams, project access", icon: Users, tone: "#C2276F" },
    { href: "/app/admin/projects", label: "Live price lists", value: activeLists, hint: "Versions, drafts, payment plans", icon: FileSpreadsheet, tone: "#2E9E5B" },
  ];

  return (
    <>
      <PageHeader eyebrow="Admin" title="Set up and run Flow Inventory" subtitle="Projects, towers, units, price lists and people. Every change here is audited." actions={<ButtonLink href="/app/admin/projects/new">New project</ButtonLink>} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="group rounded-2xl focus-visible:ring-4 focus-visible:ring-purple/20 focus-visible:outline-none">
            <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lg sm:p-6">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${t.tone} 12%, transparent)`, color: t.tone }}>
                  <t.icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-purple" />
              </div>
              <p className="mt-5 font-heading text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{t.value.toLocaleString("en-IN")}</p>
              <p className="mt-1 font-medium">{t.label}</p>
              <p className="mt-0.5 hidden text-xs text-muted sm:block">{t.hint}</p>
            </Card>
          </Link>
        ))}
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent changes</h2>
          <Link href="/app/admin/audit" className="text-sm font-medium text-purple hover:underline">
            Full audit log
          </Link>
        </div>
        <Card className="divide-y divide-line">
          {recent.length === 0 && <p className="p-6 text-sm text-muted">Nothing has changed yet.</p>}
          {recent.map((r) => (
            <Link key={r.id} href={`/app/admin/audit?entity=${r.entity}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-bg">
              <Badge tone={r.action.includes("create") ? "green" : r.action.includes("delete") || r.action.includes("cancel") ? "magenta" : r.action.includes("activate") ? "purple" : "neutral"}>{r.action}</Badge>
              <span className="text-sm">{r.actor ?? (r.actorType === "system" ? "System" : r.actorType === "customer" ? "Customer" : "—")}</span>
              <span className="ml-auto text-xs text-muted">{formatDateTime(r.at)}</span>
            </Link>
          ))}
        </Card>
      </section>
    </>
  );
}
