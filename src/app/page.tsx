import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowRight, MapPin } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const projects = await db.select({ p: s.projects, developer: s.developers.name }).from(s.projects).innerJoin(s.developers, eq(s.projects.developerId, s.developers.id)).where(eq(s.projects.publicBooking, true)).orderBy(asc(s.projects.name));
  return (
    <main className="min-h-dvh">
      <section className="relative overflow-hidden bg-[#1C2033] px-5 pt-8 pb-28 text-white sm:px-10">
        <div className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#7A2DB0] opacity-40 blur-[120px]" />
        <div className="pointer-events-none absolute -right-32 -bottom-40 h-[480px] w-[480px] rounded-full bg-[#C2276F] opacity-30 blur-[120px]" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between">
          <p className="text-sm font-semibold tracking-[0.3em] text-[#f6a2c8]">FLOW REALTY</p>
          <Link href="/login" className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Team sign in</Link>
        </nav>
        <div className="relative mx-auto mt-20 max-w-6xl">
          <h1 className="max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">Choose your home. See the real price. Book it in minutes.</h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">Live availability across Bengaluru and Mysuru projects, with transparent cost sheets and secure online booking.</p>
        </div>
      </section>
      <section className="relative mx-auto -mt-16 grid max-w-6xl gap-4 px-5 pb-20 sm:px-10 md:grid-cols-3">
        {projects.map(({ p, developer }) => (
          <div key={p.id} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-[0_8px_30px_-12px_rgba(28,32,51,0.18)]">
            <div className="h-1 w-12 rounded-full" style={{ background: p.accentColor ?? "#7A2DB0" }} />
            <p className="mt-5 text-xs font-semibold tracking-[0.16em] text-muted uppercase">{developer}</p>
            <h2 className="mt-1 text-2xl font-semibold">{p.name}</h2>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <MapPin className="h-3.5 w-3.5" /> {p.city} · {p.type === "plotted" ? "Plots" : "Apartments"}
            </p>
            <ButtonLink href={`/p/${p.slug}/book`} variant="accent" className="mt-8 w-full">
              Book now <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        ))}
      </section>
    </main>
  );
}
