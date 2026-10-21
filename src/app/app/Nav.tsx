"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ClipboardCheck, LayoutDashboard, ReceiptText, Settings, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";

const ICONS: Record<string, LucideIcon> = { dashboard: LayoutDashboard, projects: Building2, bookings: ReceiptText, approvals: ClipboardCheck, admin: Settings };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-1">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = it.href === "/app" ? path === "/app" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors", active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white")}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            <span className="flex-1">{it.label}</span>
            {!!it.badge && <span className="rounded-full bg-magenta px-2 py-0.5 text-xs font-semibold text-white">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = it.href === "/app" ? path === "/app" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={cx("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active ? "text-purple" : "text-muted")}>
            <Icon className="h-5 w-5" strokeWidth={1.8} />
            {it.label}
            {!!it.badge && <span className="absolute top-1.5 right-1/2 translate-x-4 rounded-full bg-magenta px-1.5 text-[10px] text-white">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
