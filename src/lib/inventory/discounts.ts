import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { DEFAULT_DISCOUNT_LIMITS, discountApprover, type TreeUser } from "@/lib/auth/permissions";

/** Highest discount (₹ PSF) already approved for this user on this unit. */
export async function approvedDiscount(db: DB, userId: string, unitId: string) {
  const rows = await db.query.approvals.findMany({ where: and(eq(s.approvals.type, "discount"), eq(s.approvals.requestedBy, userId), eq(s.approvals.unitId, unitId), eq(s.approvals.status, "approved")) });
  return Math.max(0, ...rows.map((r) => Number((r.payload as { discountPsf?: number }).discountPsf ?? 0)));
}

export async function treeAndLimits(db: DB, projectId: string) {
  const [users, project] = await Promise.all([db.query.users.findMany(), db.query.projects.findFirst({ where: eq(s.projects.id, projectId) })]);
  return { tree: new Map<string, TreeUser>(users.map((u) => [u.id, u])), limits: { ...DEFAULT_DISCOUNT_LIMITS, ...(project?.discountLimits ?? {}) } };
}

/**
 * Who still has to approve `discountPsf` for this user on this unit: null when it is within their own limit
 * or already approved; otherwise the approver's name ("leadership" if nobody in the chain can).
 */
export async function discountNeedsApproval(db: DB, userId: string, unitId: string, projectId: string, discountPsf: number): Promise<{ id: string | null; name: string } | null> {
  if (discountPsf <= 0 || discountPsf <= (await approvedDiscount(db, userId, unitId))) return null;
  const { tree, limits } = await treeAndLimits(db, projectId);
  try {
    const a = discountApprover(tree, userId, discountPsf, limits);
    return a ? { id: a.id, name: a.name ?? "your manager" } : null;
  } catch {
    return { id: null, name: "leadership" };
  }
}
