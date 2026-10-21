import Link from "next/link";
import { asc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { ROLE_LABEL } from "@/lib/admin/shared";
import { flattenTree } from "@/lib/admin/users";
import { Badge, ButtonLink, Card, cx, PageHeader } from "@/components/ui";
import { TableCard, td, th } from "../_components/blocks";

const ROLE_TONE: Record<string, "purple" | "magenta" | "blue" | "green" | "amber" | "neutral"> = { super_admin: "purple", leadership: "magenta", team_lead: "blue", sales_manager: "green", developer_user: "amber" };

export default async function AdminUsers() {
  await requireAdmin();
  const db = await getDb();
  const [users, links, projects] = await Promise.all([db.query.users.findMany({ orderBy: asc(s.users.name) }), db.select().from(s.userProjects), db.query.projects.findMany({ columns: { id: true, name: true } })]);
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name;
  const projectsOf = (id: string) => links.filter((l) => l.userId === id).map((l) => projects.find((p) => p.id === l.projectId)?.name).filter(Boolean);
  const tree = flattenTree(users.filter((u) => u.active));

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users" subtitle="Staff accounts, roles, reporting lines and project access." actions={<ButtonLink href="/app/admin/users/new"><Plus className="h-4 w-4" /> New user</ButtonLink>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <TableCard>
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Role</th>
                <th className={th}>Manager</th>
                <th className={th}>Projects</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const ps = projectsOf(u.id);
                return (
                  <tr key={u.id} className={cx("hover:bg-bg/60", !u.active && "opacity-60")}>
                    <td className={td}>
                      <Link href={`/app/admin/users/${u.id}`} className="group flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7A2DB0] to-[#C2276F] text-xs font-semibold text-white">{u.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold group-hover:text-purple">{u.name}</span>
                          <span className="block truncate text-xs text-muted">{u.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={td}><Badge tone={ROLE_TONE[u.role] ?? "neutral"}>{ROLE_LABEL[u.role]}</Badge></td>
                    <td className={cx(td, "whitespace-nowrap")}>{nameOf(u.managerId) ?? <span className="text-muted">—</span>}</td>
                    <td className={cx(td, "max-w-64")}>{u.allProjects ? <Badge tone="purple">All projects</Badge> : ps.length ? <span className="text-sm">{ps.join(", ")}</span> : <span className="text-muted">None</span>}</td>
                    <td className={td}>{u.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>

        <Card className="h-fit p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Reporting tree</h2>
          <p className="mt-1 text-sm text-muted">Discount approvals route up this tree.</p>
          <ul className="mt-5 space-y-1">
            {tree.map(({ user: u, depth }) => (
              <li key={u.id} style={{ paddingLeft: depth * 20 }}>
                <Link href={`/app/admin/users/${u.id}`} className={cx("flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-bg", depth > 0 && "border-l-2 border-line")}>
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", depth === 0 ? "bg-purple" : depth === 1 ? "bg-magenta" : "bg-royal")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="block text-xs text-muted">{ROLE_LABEL[u.role]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
