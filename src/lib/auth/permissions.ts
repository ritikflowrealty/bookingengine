// Server-side permission checks. Every API route / server action calls `can()` or `assertCan()`.

export const ROLES = ["super_admin", "leadership", "developer_user", "team_lead", "sales_manager", "pre_sales", "channel_partner", "customer"] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  | "inventory.view"
  | "inventory.view_internal" // closing / sourcing / target PSF, landowner share
  | "inventory.edit"
  | "inventory.block" // block / release units (developer, management, landowner share)
  | "unit.hold"
  | "unit.hold_request"
  | "hold.extend.approve"
  | "costsheet.share"
  | "booking.create"
  | "booking.view"
  | "discount.approve"
  | "cancellation.approve"
  | "transfer.approve"
  | "lead.reassign"
  | "pricelist.edit"
  | "project.manage"
  | "users.manage"
  | "settings.manage"
  | "audit.view"
  | "reports.view";

const GRANTS: Record<Role, readonly Action[]> = {
  super_admin: [], // everything, see can()
  leadership: ["inventory.view", "inventory.view_internal", "inventory.block", "unit.hold", "hold.extend.approve", "costsheet.share", "booking.create", "booking.view", "discount.approve", "cancellation.approve", "transfer.approve", "lead.reassign", "audit.view", "reports.view"],
  developer_user: ["inventory.view", "booking.view"], // + inventory.block when user.canBlock
  team_lead: ["inventory.view", "unit.hold", "hold.extend.approve", "costsheet.share", "booking.create", "booking.view", "discount.approve", "lead.reassign", "reports.view"],
  sales_manager: ["inventory.view", "unit.hold", "costsheet.share", "booking.create", "booking.view"],
  pre_sales: ["inventory.view", "costsheet.share"],
  channel_partner: ["inventory.view", "unit.hold_request"],
  customer: [], // customers go through their own OTP-scoped routes, never staff actions
};

export type Actor = {
  id: string;
  role: Role;
  allProjects?: boolean; // leadership with company-wide scope
  projectIds?: string[];
  developerIds?: string[]; // developer users: all projects of their developer
  canBlock?: boolean;
};

export type Scope = { projectId?: string; developerId?: string };

function inScope(a: Actor, s: Scope) {
  if (a.role === "super_admin" || a.allProjects) return true;
  if (a.role === "developer_user") return !!s.developerId && !!a.developerIds?.includes(s.developerId);
  if (!s.projectId) return true; // non-project actions (e.g. own reports) are filtered by query scope instead
  return !!a.projectIds?.includes(s.projectId);
}

export function can(a: Actor, action: Action, scope: Scope = {}): boolean {
  if (a.role === "super_admin") return true;
  const granted = GRANTS[a.role].includes(action) || (a.role === "developer_user" && action === "inventory.block" && !!a.canBlock);
  return granted && inScope(a, scope);
}

export class ForbiddenError extends Error {
  status = 403;
}

export function assertCan(a: Actor, action: Action, scope: Scope = {}) {
  if (!can(a, action, scope)) throw new ForbiddenError(`Not allowed: ${action}`);
}

// ---- Discount approvals route up the reporting tree ----

/** PSF discount each role may give or approve on a project; Infinity = unlimited. Configured per project by admin. */
export type DiscountLimits = Partial<Record<Role, number>>;
export const DEFAULT_DISCOUNT_LIMITS: DiscountLimits = { sales_manager: 0, team_lead: 50, leadership: Infinity, super_admin: Infinity };

export type TreeUser = { id: string; role: Role; managerId?: string | null; name?: string };

/**
 * Who must approve a discount requested by `requesterId`? Returns null when the requester's own limit covers it,
 * otherwise the nearest manager up the tree whose limit covers it. Throws if nobody in the chain can approve.
 */
export function discountApprover(users: Map<string, TreeUser>, requesterId: string, discountPsf: number, limits: DiscountLimits = DEFAULT_DISCOUNT_LIMITS): TreeUser | null {
  const limitOf = (u: TreeUser) => limits[u.role] ?? 0;
  let u = users.get(requesterId);
  if (!u) throw new Error("Unknown requester");
  if (discountPsf <= limitOf(u)) return null;
  const seen = new Set<string>();
  while (u.managerId && !seen.has(u.id)) {
    seen.add(u.id);
    u = users.get(u.managerId);
    if (!u) break;
    if (discountPsf <= limitOf(u)) return u;
  }
  throw new Error(`No approver in the reporting chain can approve ₹${discountPsf} PSF`);
}
