import Link from "next/link";
import { Timer } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { myHolds, projectsWithCounts } from "@/lib/inventory/queries";
import { Card, PageHeader, Stat } from "@/components/ui";
import { ProjectCard } from "@/components/ProjectCard";
import { Countdown } from "@/components/Countdown";

export default async function Dashboard() {
  const user = await requireStaff();
  const [projects, holds] = await Promise.all([projectsWithCounts(user.actor), myHolds(user.id)]);
  const sum = (k: "available" | "on_hold" | "booked" | "sold") => projects.reduce((a, p) => a + (p.counts[k] ?? 0), 0);
  const hour = new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
  const greeting = Number(hour) < 12 ? "Good morning" : Number(hour) < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader eyebrow={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })} title={`${greeting}, ${user.name.split(" ")[0]}`} subtitle="Live inventory across your projects." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Available" value={sum("available")} accent="var(--st-available)" />
        <Stat label="On hold" value={sum("on_hold")} accent="var(--st-on_hold)" />
        <Stat label="Booked" value={sum("booked")} accent="var(--st-booked)" />
        <Stat label="Sold / Registered" value={sum("sold")} accent="var(--st-sold)" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section>
          <h2 className="mb-4 text-lg font-semibold">Projects</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => (
              <ProjectCard key={p.id} href={`/app/projects/${p.slug}`} name={p.name} developer={p.developer} city={p.city} type={p.type} accent={p.accentColor} counts={p.counts} />
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-4 text-lg font-semibold">My holds</h2>
          <Card className="divide-y divide-line">
            {holds.length === 0 && <p className="p-6 text-sm text-muted">No active holds. Hold a unit from the inventory to reserve it for your customer.</p>}
            {holds.map((h) => (
              <Link key={h.id} href={`/app/projects/${h.slug}?unit=${h.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-bg">
                <div>
                  <p className="font-medium">{h.number}</p>
                  <p className="text-xs text-muted">{h.project}</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-[#e0a100]/12 px-2.5 py-1 text-xs font-medium text-[#8a6200]">
                  <Timer className="h-3.5 w-3.5" />
                  <Countdown to={h.holdExpiresAt!} />
                </span>
              </Link>
            ))}
          </Card>
        </section>
      </div>
    </>
  );
}
