import { redirect } from "next/navigation";
import { DEMO } from "@/db";
import { currentStaff } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Flow Inventory" };

const DEMO_USERS = [
  ["admin@flowrealty.in", "Super admin"],
  ["leadership@flowrealty.in", "Leadership"],
  ["teamlead@flowrealty.in", "Team lead"],
  ["sales@flowrealty.in", "Sales manager"],
  ["presales@flowrealty.in", "Pre-sales"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentStaff()) redirect("/app");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#1C2033] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#7A2DB0] opacity-40 blur-[120px]" />
        <div className="pointer-events-none absolute -right-32 -bottom-40 h-[480px] w-[480px] rounded-full bg-[#C2276F] opacity-30 blur-[120px]" />
        <div className="pointer-events-none absolute top-1/3 right-1/4 h-[260px] w-[260px] rounded-full bg-[#3D5FD9] opacity-25 blur-[100px]" />
        <p className="relative text-sm font-semibold tracking-[0.3em] text-[#f6a2c8]">FLOW REALTY</p>
        <div className="relative max-w-md">
          <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight">Every unit, every price, live.</h1>
          <p className="mt-5 text-lg text-white/70">Inventory, cost sheets and bookings for Sipani, Sumadhura, Beyond Acres and more, in one place.</p>
          <div className="mt-10 grid grid-cols-5 gap-1.5">
            {Array.from({ length: 40 }, (_, i) => {
              const st = ["available", "available", "booked", "sold", "available", "on_hold", "sold", "available"][(i * 7) % 8];
              return <div key={i} className="aspect-square rounded-md opacity-90" style={{ background: `var(--st-${st})` }} />;
            })}
          </div>
        </div>
        <p className="relative text-sm text-white/50">© Flow Realty · Bengaluru</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold tracking-[0.3em] text-magenta lg:hidden">FLOW REALTY</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-2 text-muted">Flow Inventory for the sales team.</p>
          <div className="mt-8">
            <LoginForm next={next} demo={DEMO} />
          </div>
          {DEMO && (
            <div className="mt-8 rounded-2xl border border-dashed border-line p-4 text-sm">
              <p className="font-medium">Demo mode</p>
              <p className="mt-1 text-muted">Sample data, resets on redeploy. Password for all: <code className="rounded bg-ink/5 px-1">flow@1234</code></p>
              <ul className="mt-2 space-y-0.5 text-muted">
                {DEMO_USERS.map(([e, r]) => (
                  <li key={e}>
                    <code className="text-ink">{e}</code> · {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-8 text-sm text-muted">
            Buying a home? <a className="font-medium text-purple underline-offset-4 hover:underline" href="/p/sipani-city/book">Book online</a>
          </p>
        </div>
      </section>
    </main>
  );
}
