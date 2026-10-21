import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { currentCustomer } from "@/lib/auth/session";
import { getInventory, getProject } from "@/lib/inventory/service";
import { toClientUnit } from "@/lib/inventory/client-unit";
import { customerProfile, requiredDocsFor } from "@/app/actions/customer";
import { Card } from "@/components/ui";
import { OtpLogin } from "./OtpLogin";
import { Picker } from "./Picker";
import { Checkout, type CheckoutData } from "./Checkout";
import { SignOut } from "./SignOut";

export async function BookingPage({ slug, kiosk, search }: { slug: string; kiosk: boolean; search: { booking?: string; unit?: string; payment?: string } }) {
  const db = await getDb();
  const project = await getProject(db, slug);
  if (!project) notFound();
  const developer = await db.query.developers.findFirst({ where: eq(s.developers.id, project.developerId) });
  const accent = project.accentColor ?? "#7A2DB0";
  const customer = await currentCustomer();
  const profile = customer ? await customerProfile(slug) : null;

  const header = (
    <header className="relative overflow-hidden bg-[#1C2033] text-white">
      <div className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full opacity-40 blur-[100px]" style={{ background: accent }} />
      <div className="pointer-events-none absolute -right-24 -bottom-32 h-72 w-72 rounded-full bg-[#C2276F] opacity-25 blur-[100px]" />
      <div className="relative mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#f6a2c8]">FLOW REALTY{developer ? ` · ${developer.name.toUpperCase()}` : ""}</p>
          <h1 className={kiosk ? "mt-1 text-4xl font-semibold" : "mt-1 text-2xl font-semibold sm:text-3xl"}>{project.name}</h1>
          {project.reraNumbers.length > 0 && <p className="mt-1 text-xs text-white/50">RERA {project.reraNumbers.join(", ")}</p>}
        </div>
        {profile && (
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 py-2 pr-2 pl-4 backdrop-blur">
            <div className="text-right text-sm">
              <p className="font-medium">{profile.name ?? `+91 ${profile.phone}`}</p>
              {profile.salesManager && <p className="text-xs text-white/60">Your RM: {profile.salesManager}</p>}
            </div>
            <SignOut kiosk={kiosk} slug={slug} />
          </div>
        )}
      </div>
    </header>
  );

  if (!project.publicBooking)
    return (
      <>
        {header}
        <main className="mx-auto max-w-xl px-4 py-16 text-center text-muted">Online booking for {project.name} opens soon. Please contact your Flow Realty relationship manager.</main>
      </>
    );

  if (!customer || !profile)
    return (
      <>
        {header}
        <main className="mx-auto grid max-w-5xl gap-10 px-4 py-10 sm:px-8 lg:grid-cols-2 lg:py-16">
          <div>
            <h2 className={kiosk ? "text-5xl font-semibold tracking-tight" : "text-3xl font-semibold tracking-tight sm:text-4xl"}>Pick your home. Book it in minutes.</h2>
            <ul className="mt-6 space-y-3 text-muted">
              <li>1 · Verify your mobile number on WhatsApp</li>
              <li>2 · Choose from live availability{project.type === "plotted" ? " on the master plan" : " in 3D"}</li>
              <li>3 · See the exact price and pay the booking token securely</li>
              <li>4 · Fill the booking form and upload KYC, now or later</li>
            </ul>
          </div>
          <Card className="p-6 sm:p-8">
            <h3 className="text-xl font-semibold">Sign in with your mobile</h3>
            <p className="mt-1 mb-6 text-sm text-muted">No password needed.</p>
            <OtpLogin slug={slug} kiosk={kiosk} />
          </Card>
        </main>
      </>
    );

  const bookingId = search.booking ?? profile.bookings.find((b) => b.slug === slug && ["held", "token_paid", "form_submitted"].includes(b.status))?.id;
  if (bookingId) {
    const b = await db.query.bookings.findFirst({ where: and(eq(s.bookings.id, bookingId), eq(s.bookings.customerId, customer.id)) });
    if (b) {
      const unit = (await db.query.units.findFirst({ where: eq(s.units.id, b.unitId) }))!;
      const docs = await db.query.kycDocuments.findMany({ where: eq(s.kycDocuments.bookingId, b.id), columns: { type: true } });
      const kyc = (customer.kyc ?? {}) as { residency?: string };
      const data: CheckoutData = {
        bookingId: b.id,
        status: b.status,
        unitLabel: unit.kind === "plot" ? `Plot ${unit.number}` : unit.number,
        projectName: project.name,
        holdExpiresAt: unit.bookingId === b.id && unit.holdExpiresAt ? unit.holdExpiresAt.toISOString() : null,
        tokenAmount: Number(b.tokenAmount),
        sheet: b.costSheet,
        docsHave: docs.map((d) => d.type),
        docsRequired: await requiredDocsFor(kyc.residency),
        prefill: { fullName: customer.name, email: customer.email },
        paymentResult: search.payment ?? null,
      };
      return (
        <>
          {header}
          <main className="px-4 py-8 sm:px-8">
            <Checkout d={data} kiosk={kiosk} />
          </main>
        </>
      );
    }
  }

  const inv = await getInventory(db, project.id, false);
  return (
    <>
      {header}
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Hi{profile.name ? ` ${profile.name.split(" ")[0]}` : ""}, choose your {project.type === "plotted" ? "plot" : "home"}</h2>
            <p className="text-sm text-muted">
              {profile.source ? `Enquiry via ${profile.source}. ` : ""}Green means available right now. Prices update live.
            </p>
          </div>
        </div>
        <Picker
          project={{ slug, name: project.name, type: project.type, accentColor: project.accentColor }}
          towers={inv.towers.map((t) => ({ id: t.id, name: t.name, code: t.code, floors: t.floors, unitsPerFloor: t.unitsPerFloor }))}
          initialUnits={inv.units.map(toClientUnit)}
          kiosk={kiosk}
          preselect={search.unit}
        />
      </main>
    </>
  );
}
