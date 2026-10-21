import { BookingPage } from "@/app/p/[slug]/book/BookingPage";
import { KioskShell } from "./KioskShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book · Flow Realty kiosk", robots: { index: false } };

export default async function Kiosk({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ booking?: string; unit?: string; payment?: string }> }) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  return (
    <KioskShell slug={slug}>
      <BookingPage slug={slug} kiosk search={search} />
    </KioskShell>
  );
}
