"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentProps, type ReactNode } from "react";
import { cx, inputClass } from "@/components/ui";

/** Underlined tab bar; scrolls sideways on phones. `exact` tabs only match their own path. */
export function Tabs({ items, size = "lg" }: { items: { href: string; label: string; exact?: boolean }[]; size?: "lg" | "md" }) {
  const path = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Sections">
      <div className={cx("flex min-w-max gap-1 border-b border-line", size === "lg" ? "mb-8" : "mb-6")}>
        {items.map((it) => {
          const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "-mb-px flex items-center border-b-2 px-3 font-medium transition-colors sm:px-4",
                size === "lg" ? "h-12 text-[15px]" : "h-11 text-sm",
                active ? "border-purple text-purple" : "border-transparent text-muted hover:border-line hover:text-ink",
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-2.5", disabled && "cursor-not-allowed opacity-60")}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-purple" : "bg-ink/15")}
      >
        <span className={cx("absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
      </button>
    </label>
  );
}

/** Number box that lets people type freely ("-", "0.") and reports undefined when empty. */
export function NumInput({ value, onChange, className, ...p }: { value: number | undefined | null; onChange: (v: number | undefined) => void } & Omit<ComponentProps<"input">, "value" | "onChange">) {
  const show = (v: number | undefined | null) => (v === undefined || v === null ? "" : String(v));
  const [text, setText] = useState(show(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (text.trim() === "" ? value !== undefined && value !== null : Number(text) !== value) setText(show(value));
  }
  return (
    <input
      inputMode="decimal"
      className={cx(inputClass, "tabular-nums", className)}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === "") onChange(undefined);
        else if (Number.isFinite(Number(t))) onChange(Number(t));
      }}
      {...p}
    />
  );
}

/** Percent box over a 0–1 fraction (5 ↔ 0.05). */
export function PctInput({ value, onChange, ...p }: { value: number | undefined; onChange: (v: number | undefined) => void } & Omit<ComponentProps<"input">, "value" | "onChange">) {
  return <NumInput value={value === undefined ? undefined : +(value * 100).toFixed(6)} onChange={(v) => onChange(v === undefined ? undefined : +(v / 100).toFixed(8))} {...p} />;
}

/** Comma-separated list box; keeps what you type and reports the parsed list. */
export function ListInput<T extends string | number>({ value, onChange, numeric, className, ...p }: { value: T[] | undefined; onChange: (v: T[] | undefined) => void; numeric?: boolean } & Omit<ComponentProps<"input">, "value" | "onChange">) {
  const [text, setText] = useState((value ?? []).join(", "));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (JSON.stringify(parse(text)) !== JSON.stringify(value ?? [])) setText((value ?? []).join(", "));
  }
  function parse(t: string) {
    const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
    return (numeric ? parts.map(Number).filter(Number.isFinite) : parts) as T[];
  }
  return (
    <input
      className={cx(inputClass, className)}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const l = parse(e.target.value);
        onChange(l.length ? l : undefined);
      }}
      {...p}
    />
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx("h-10 rounded-full border px-4 text-sm font-medium transition-colors", active ? "border-purple bg-purple text-white" : "border-line bg-surface text-ink hover:border-ink/30")}>
      {children}
    </button>
  );
}
