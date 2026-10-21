import { BookingPage } from "./BookingPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book online · Flow Realty" };

export default async function Book({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ booking?: string; unit?: string; payment?: string }> }) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  return <BookingPage slug={slug} kiosk={false} search={search} />;
}
