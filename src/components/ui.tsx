import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Small design-system primitives. Keep visual decisions here so every screen stays consistent.

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const buttonStyles = {
  primary: "bg-purple text-white shadow-sm shadow-purple/20 hover:bg-[#6a2499] active:bg-[#5c1f86]",
  accent: "bg-magenta text-white shadow-sm shadow-magenta/20 hover:bg-[#a91f5f]",
  secondary: "bg-surface text-ink border border-line hover:border-ink/30 hover:bg-bg",
  ghost: "text-ink hover:bg-ink/5",
  danger: "bg-surface text-[#b42318] border border-[#f1c4bf] hover:bg-[#fef3f2]",
} as const;
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-14 px-7 text-base", xl: "h-16 px-8 text-lg" } as const;

type ButtonProps = { variant?: keyof typeof buttonStyles; size?: keyof typeof sizes };
export function buttonClass({ variant = "primary", size = "md" }: ButtonProps = {}, extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
    buttonStyles[variant],
    sizes[size],
    extra,
  );
}

export function Button({ variant, size, className, ...p }: ButtonProps & ComponentProps<"button">) {
  return <button className={buttonClass({ variant, size }, className)} {...p} />;
}

export function ButtonLink({ variant, size, className, ...p }: ButtonProps & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size }, className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(28,32,51,0.04),0_8px_24px_-12px_rgba(28,32,51,0.08)]", className)} {...p} />;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold tracking-[0.18em] text-magenta uppercase">{eyebrow}</p>}
        <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export const STATUS_LABEL = { available: "Available", on_hold: "On hold", booked: "Booked", sold: "Sold / Registered", blocked: "Blocked" } as const;
export type Status = keyof typeof STATUS_LABEL;

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)} style={{ background: `var(--st-${status})` }} />;
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `color-mix(in srgb, var(--st-${status}) 14%, transparent)`, color: `color-mix(in srgb, var(--st-${status}) 75%, #1c2033)` }}>
      <StatusDot status={status} className="h-1.5 w-1.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "purple" | "magenta" | "blue" | "green" | "amber" }) {
  const tones = { neutral: "bg-ink/5 text-ink/80", purple: "bg-purple/10 text-purple", magenta: "bg-magenta/10 text-magenta", blue: "bg-royal/10 text-royal", green: "bg-[#2e9e5b]/12 text-[#1f6f40]", amber: "bg-[#e0a100]/15 text-[#8a6200]" };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-[#b42318]">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "block w-full rounded-xl border border-line bg-surface px-4 h-12 text-[15px] text-ink placeholder:text-muted/70 transition focus:border-purple focus:outline-none focus:ring-4 focus:ring-purple/10";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...p} />;
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(inputClass, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235b6072%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_1rem_center] bg-no-repeat pr-10", className)} {...p} />;
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="mt-2 font-heading text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple/15 to-magenta/15" />
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </Card>
  );
}

/** Stacked availability bar: proportion of units in each status. */
export function AvailabilityBar({ counts, className }: { counts: Partial<Record<Status, number>>; className?: string }) {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) || 1;
  return (
    <div className={cx("flex h-2 w-full overflow-hidden rounded-full bg-ink/5", className)}>
      {(Object.keys(STATUS_LABEL) as Status[]).map((k) => (counts[k] ? <div key={k} style={{ width: `${(counts[k]! / total) * 100}%`, background: `var(--st-${k})` }} title={`${STATUS_LABEL[k]}: ${counts[k]}`} /> : null))}
    </div>
  );
}
