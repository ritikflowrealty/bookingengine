import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { AvailabilityBar, Card, STATUS_LABEL, StatusDot, type Status } from "./ui";

export function ProjectCard({ href, name, developer, city, type, accent, counts }: { href: string; name: string; developer: string; city?: string | null; type: string; accent?: string | null; counts: Partial<Record<Status, number>> }) {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <Card className="relative overflow-hidden p-6 transition group-hover:-translate-y-0.5 group-hover:shadow-lg group-focus-visible:ring-4 group-focus-visible:ring-purple/20">
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent ?? "var(--purple)" }} />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">{developer}</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">{name}</h3>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <MapPin className="h-3.5 w-3.5" /> {city} · {type === "plotted" ? "Plots" : "Apartments"}
            </p>
          </div>
          <span className="rounded-full border border-line p-2 text-muted transition group-hover:border-purple group-hover:bg-purple group-hover:text-white">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-6 flex items-baseline gap-2">
          <span className="font-heading text-4xl font-semibold tabular-nums" style={{ color: "var(--st-available)" }}>
            {counts.available ?? 0}
          </span>
          <span className="text-sm text-muted">of {total} available</span>
        </div>
        <AvailabilityBar counts={counts} className="mt-3" />
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(Object.keys(STATUS_LABEL) as Status[])
            .filter((k) => k !== "available" && counts[k])
            .map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <StatusDot status={k} className="h-2 w-2" />
                {counts[k]} {STATUS_LABEL[k].toLowerCase()}
              </span>
            ))}
        </div>
      </Card>
    </Link>
  );
}
