import { desc, eq, or, isNull, and } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ApprovalRow } from "./ApprovalRow";

const TYPE_LABEL = { discount: "Discount", hold_extension: "Hold extension", cancellation: "Cancellation", transfer: "Transfer" } as const;

export default async function Approvals() {
  const user = await requireStaff();
  const db = await getDb();
  const senior = user.role === "super_admin" || user.role === "leadership";
  const rows = await db
    .select({ a: s.approvals, requester: s.users.name, project: s.projects.name, unit: s.units.number })
    .from(s.approvals)
    .innerJoin(s.users, eq(s.approvals.requestedBy, s.users.id))
    .innerJoin(s.projects, eq(s.approvals.projectId, s.projects.id))
    .leftJoin(s.units, eq(s.approvals.unitId, s.units.id))
    .where(senior ? undefined : or(eq(s.approvals.approverId, user.id), and(isNull(s.approvals.approverId), eq(s.approvals.requestedBy, user.id))))
    .orderBy(desc(s.approvals.createdAt))
    .limit(200);
  const mineToDecide = rows.filter((r) => r.a.status === "pending" && r.a.requestedBy !== user.id && (r.a.approverId === user.id || senior));
  const rest = rows.filter((r) => !mineToDecide.includes(r));

  return (
    <>
      <PageHeader eyebrow="Team" title="Approvals" subtitle="Discounts, hold extensions and cancellations waiting on you." />
      {mineToDecide.length === 0 ? (
        <EmptyState title="You're all caught up">New requests from your team will appear here.</EmptyState>
      ) : (
        <div className="space-y-3">
          {mineToDecide.map(({ a, requester, project, unit }) => (
            <ApprovalRow
              key={a.id}
              id={a.id}
              type={TYPE_LABEL[a.type]}
              title={`${unit ?? ""} · ${project}`}
              detail={a.type === "discount" ? `₹${(a.payload as { discountPsf?: number }).discountPsf} PSF discount` : a.type === "hold_extension" ? `+${(a.payload as { hours?: number }).hours ?? 24} hours` : (a.comments ?? "")}
              requester={requester}
              at={a.createdAt.toISOString()}
              canDecide={can(user.actor, a.type === "discount" ? "discount.approve" : a.type === "hold_extension" ? "hold.extend.approve" : "cancellation.approve", { projectId: a.projectId })}
            />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-base font-semibold">History</h2>
          <Card className="divide-y divide-line">
            {rest.map(({ a, requester, project, unit }) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium">
                    {TYPE_LABEL[a.type]} · {unit} · {project}
                  </p>
                  <p className="text-xs text-muted">
                    {requester} · {a.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                  </p>
                </div>
                <Badge tone={a.status === "approved" ? "green" : a.status === "rejected" ? "magenta" : "amber"}>{a.status}</Badge>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
