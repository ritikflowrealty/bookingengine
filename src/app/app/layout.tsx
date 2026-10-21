import { and, eq, sql } from "drizzle-orm";
import { LogOut } from "lucide-react";
import { getDb, DEMO } from "@/db";
import * as s from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { logout } from "@/app/actions/auth";
import { BottomNav, SideNav, type NavItem } from "./Nav";

const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", leadership: "Leadership", developer_user: "Developer", team_lead: "Team lead", sales_manager: "Sales manager", pre_sales: "Pre-sales", channel_partner: "Channel partner" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const db = await getDb();
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.approvals)
    .where(and(eq(s.approvals.status, "pending"), eq(s.approvals.approverId, user.id)));

  const items: NavItem[] = [
    { href: "/app", label: "Dashboard", icon: "dashboard" },
    { href: "/app/projects", label: "Inventory", icon: "projects" },
    ...(can(user.actor, "booking.view") ? [{ href: "/app/bookings", label: "Bookings", icon: "bookings" as const }] : []),
    ...(can(user.actor, "discount.approve") || can(user.actor, "hold.extend.approve") ? [{ href: "/app/approvals", label: "Approvals", icon: "approvals" as const, badge: pending.n }] : []),
    ...(user.role === "super_admin" ? [{ href: "/app/admin", label: "Admin", icon: "admin" as const }] : []),
  ];
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-[#1C2033] px-4 py-6 text-white lg:flex">
        <div className="px-3">
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#f6a2c8]">FLOW REALTY</p>
          <p className="mt-1 font-heading text-xl font-semibold">Flow Inventory</p>
        </div>
        <div className="mt-8 flex-1">
          <SideNav items={items} />
        </div>
        {DEMO && <p className="mx-3 mb-4 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/60">Demo data · resets on redeploy</p>}
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#7A2DB0] to-[#C2276F] text-sm font-semibold">{initials}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-white/55">{ROLE_LABEL[user.role]}</p>
          </div>
          <form action={logout}>
            <button className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.3em] text-magenta">FLOW REALTY</p>
            <p className="font-heading font-semibold">Flow Inventory</p>
          </div>
          <form action={logout}>
            <button className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm" aria-label="Sign out">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#7A2DB0] to-[#C2276F] text-xs font-semibold text-white">{initials}</span>
              <LogOut className="h-4 w-4 text-muted" />
            </button>
          </form>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">{children}</main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
