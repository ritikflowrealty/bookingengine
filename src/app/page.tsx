import Link from "next/link";

const statuses = [
  ["available", "Available"],
  ["on_hold", "On hold"],
  ["booked", "Booked"],
  ["sold", "Sold / Registered"],
  ["blocked", "Blocked"],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-sm font-medium tracking-widest text-magenta">FLOW REALTY</p>
      <h1 className="mt-2 text-4xl font-semibold">Flow Inventory</h1>
      <p className="mt-3 text-muted">Live inventory, pricing and booking across Flow Realty projects.</p>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        {statuses.map(([k, label]) => (
          <span key={k} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: `var(--st-${k})` }} />
            {label}
          </span>
        ))}
      </div>
      <Link href="/preview/cost-sheet" className="mt-10 inline-block rounded-xl bg-purple px-6 py-3 font-medium text-white">
        Pricing engine preview
      </Link>
    </main>
  );
}
