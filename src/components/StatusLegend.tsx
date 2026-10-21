export type UnitStatus = "available" | "on_hold" | "booked" | "sold" | "blocked";

/** Display order and labels; colours live in the --st-* CSS vars (globals.css). */
export const STATUS_LABELS: Record<UnitStatus, string> = {
  available: "Available",
  on_hold: "On hold",
  booked: "Booked",
  sold: "Sold / Registered",
  blocked: "Blocked",
};

export function StatusLegend({ counts, className = "" }: { counts?: Partial<Record<UnitStatus, number>>; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink ${className}`} aria-label="Unit status legend">
      {(Object.keys(STATUS_LABELS) as UnitStatus[]).map((key) => (
        <li key={key} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: "var(--st-" + key + ")" }} />
          <span>{STATUS_LABELS[key]}</span>
          {counts && <span className="tabular-nums text-muted">{counts[key] ?? 0}</span>}
        </li>
      ))}
    </ul>
  );
}
