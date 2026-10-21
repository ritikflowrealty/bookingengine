import Link from "next/link";
import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { diffKeys } from "@/lib/admin/audit";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, buttonClass, Card, cx, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";

const PER_PAGE = 50;
type Search = { entity?: string; action?: string; actor?: string; from?: string; to?: string; page?: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function show(v: unknown) {
  if (v === undefined) return "—";
  return typeof v === "string" ? v : JSON.stringify(v, null, 1);
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const q = await searchParams;
  const db = await getDb();
  const page = Math.max(0, Number(q.page) || 0);

  const where: SQL[] = [];
  if (q.entity) where.push(eq(s.auditLog.entity, q.entity));
  if (q.action) where.push(eq(s.auditLog.action, q.action));
  if (q.actor === "system") where.push(sql`${s.auditLog.actorId} is null`);
  else if (q.actor && UUID.test(q.actor)) where.push(eq(s.auditLog.actorId, q.actor));
  // Dates are IST calendar days.
  if (q.from && DAY.test(q.from)) where.push(gte(s.auditLog.at, new Date(`${q.from}T00:00:00+05:30`)));
  if (q.to && DAY.test(q.to)) where.push(lt(s.auditLog.at, new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86400_000)));
  const cond = where.length ? and(...where) : undefined;

  const [rows, total, entities, actions, users] = await Promise.all([
    db
      .select({ id: s.auditLog.id, action: s.auditLog.action, entity: s.auditLog.entity, entityId: s.auditLog.entityId, before: s.auditLog.before, after: s.auditLog.after, at: s.auditLog.at, actorType: s.auditLog.actorType, actor: s.users.name })
      .from(s.auditLog)
      .leftJoin(s.users, eq(s.users.id, s.auditLog.actorId))
      .where(cond)
      .orderBy(desc(s.auditLog.id))
      .limit(PER_PAGE)
      .offset(page * PER_PAGE),
    db.$count(s.auditLog, cond),
    db.selectDistinct({ v: s.auditLog.entity }).from(s.auditLog).orderBy(asc(s.auditLog.entity)),
    db.selectDistinct({ v: s.auditLog.action }).from(s.auditLog).orderBy(asc(s.auditLog.action)),
    db.query.users.findMany({ orderBy: asc(s.users.name), columns: { id: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const link = (p: number) => `/app/admin/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter(([k, v]) => v && k !== "page")), page: String(p) })}`;
  const filtered = where.length > 0;

  return (
    <>
      <PageHeader eyebrow="Admin" title="Audit log" subtitle="Every change, who made it and what it changed." />
      <Card className="mb-6 p-5">
        <form className="grid grid-cols-2 items-end gap-3 sm:gap-4 lg:grid-cols-[1fr_1fr_1fr_150px_150px_auto]">
          <Field label="Entity">
            <Select name="entity" defaultValue={q.entity ?? ""}>
              <option value="">All</option>
              {entities.map((e) => <option key={e.v} value={e.v}>{e.v}</option>)}
            </Select>
          </Field>
          <Field label="Action">
            <Select name="action" defaultValue={q.action ?? ""}>
              <option value="">All</option>
              {actions.map((a) => <option key={a.v} value={a.v}>{a.v}</option>)}
            </Select>
          </Field>
          <Field label="Actor">
            <Select name="actor" defaultValue={q.actor ?? ""}>
              <option value="">Anyone</option>
              <option value="system">System</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" name="from" defaultValue={q.from} /></Field>
          <Field label="To"><Input type="date" name="to" defaultValue={q.to} /></Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 lg:flex-none">Filter</Button>
            {filtered && <Link href="/app/admin/audit" className={buttonClass({ variant: "ghost" })}>Clear</Link>}
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No entries match" : "No audit entries yet"}>{filtered ? "Try a wider date range or fewer filters." : "Changes made anywhere in the app show up here."}</EmptyState>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const keys = diffKeys(r.before, r.after);
            return (
              <details key={r.id} className="group">
                <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-5 py-4 hover:bg-bg/60 sm:grid-cols-[170px_minmax(0,220px)_1fr_160px_24px] [&::-webkit-details-marker]:hidden">
                  <span className="order-3 text-xs text-muted sm:order-none sm:text-sm">{formatDateTime(r.at)}</span>
                  <span className="order-1 sm:order-none"><Badge tone={r.action.includes("create") ? "green" : r.action.includes("delete") || r.action.includes("cancel") ? "magenta" : r.action.includes("activate") ? "purple" : r.action.includes("block") ? "amber" : "neutral"}>{r.action}</Badge></span>
                  <span className="order-4 col-span-2 min-w-0 truncate text-sm sm:order-none sm:col-span-1">
                    <span className="font-medium">{r.entity}</span> <span className="font-mono text-xs text-muted">{r.entityId.slice(0, 8)}</span>
                  </span>
                  <span className="order-2 truncate text-right text-sm sm:order-none sm:text-left">{r.actor ?? (r.actorType === "system" ? "System" : r.actorType === "customer" ? "Customer" : "—")}</span>
                  <ChevronDown className="hidden h-4 w-4 text-muted transition group-open:rotate-180 sm:block" />
                </summary>
                <div className="bg-bg/50 px-5 pt-1 pb-5">
                  {keys.length === 0 ? (
                    <p className="text-sm text-muted">No details recorded.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="text-left text-[11px] tracking-[0.12em] text-muted uppercase">
                            <th className="px-4 py-2.5 font-semibold">Field</th>
                            <th className="px-4 py-2.5 font-semibold">Before</th>
                            <th className="px-4 py-2.5 font-semibold">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keys.map((k) => (
                            <tr key={k.key} className={cx("border-t border-line align-top", k.changed && "bg-[#e0a100]/8")}>
                              <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                                {k.changed && <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#e0a100] align-middle" />}
                                {k.key}
                              </td>
                              <td className={cx("max-w-[40ch] px-4 py-2.5 font-mono text-xs break-words whitespace-pre-wrap", k.changed ? "text-[#912018]" : "text-muted")}>{show(k.before)}</td>
                              <td className={cx("max-w-[40ch] px-4 py-2.5 font-mono text-xs break-words whitespace-pre-wrap", k.changed ? "text-[#1f6f40]" : "text-muted")}>{show(k.after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-2 font-mono text-[11px] text-muted">#{r.id} · {r.entity} {r.entityId}</p>
                </div>
              </details>
            );
          })}
        </Card>
      )}

      <div className="mt-5 flex items-center justify-between text-sm">
        <span className="text-muted">{total.toLocaleString("en-IN")} entries</span>
        <div className="flex items-center gap-1">
          {page > 0 ? <Link href={link(page - 1)} className={buttonClass({ variant: "secondary", size: "sm" })} aria-label="Newer"><ChevronLeft className="h-4 w-4" /></Link> : <span className={buttonClass({ variant: "secondary", size: "sm" }, "opacity-40")}><ChevronLeft className="h-4 w-4" /></span>}
          <span className="px-3 tabular-nums">Page {page + 1} / {pages}</span>
          {page < pages - 1 ? <Link href={link(page + 1)} className={buttonClass({ variant: "secondary", size: "sm" })} aria-label="Older"><ChevronRight className="h-4 w-4" /></Link> : <span className={buttonClass({ variant: "secondary", size: "sm" }, "opacity-40")}><ChevronRight className="h-4 w-4" /></span>}
        </div>
      </div>
    </>
  );
}
