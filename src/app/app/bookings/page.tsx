import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { BOOKING_LABEL, bookingTone } from "@/lib/booking/labels";
import { formatINR } from "@/lib/format";

export default async function Bookings() {
  const user = await requireStaff();
  const db = await getDb();
  const rows = await db
    .select({ b: s.bookings, unit: s.units.number, project: s.projects.name, projectId: s.projects.id, developerId: s.projects.developerId, customer: s.customers.name, phone: s.customers.phone })
    .from(s.bookings)
    .innerJoin(s.units, eq(s.bookings.unitId, s.units.id))
    .innerJoin(s.projects, eq(s.bookings.projectId, s.projects.id))
    .leftJoin(s.customers, eq(s.bookings.customerId, s.customers.id))
    .where(user.role === "sales_manager" ? eq(s.bookings.salesManagerId, user.id) : user.actor.allProjects || user.role === "super_admin" ? undefined : inArray(s.bookings.projectId, user.actor.projectIds?.length ? user.actor.projectIds : ["00000000-0000-0000-0000-000000000000"]))
    .orderBy(desc(s.bookings.createdAt))
    .limit(200);
  const visible = rows.filter((r) => can(user.actor, "booking.view", { projectId: r.projectId, developerId: r.developerId }));

  return (
    <>
      <PageHeader eyebrow="Sales" title="Bookings" subtitle="Every booking with its frozen price, payment and KYC status." />
      {visible.length === 0 ? (
        <EmptyState title="No bookings yet">Start one from a unit in the inventory, or share the booking link with a customer.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg text-left text-xs text-muted uppercase">
                <tr>
                  {["Unit", "Customer", "Status", "Agreement value", "KYC", "Created"].map((h) => (
                    <th key={h} className="px-5 py-3 font-medium tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map(({ b, unit, project, customer, phone }) => (
                  <tr key={b.id} className="hover:bg-bg">
                    <td className="px-5 py-4">
                      <Link href={`/app/bookings/${b.id}`} className="font-medium hover:text-purple">{unit}</Link>
                      <div className="text-xs text-muted">{project}</div>
                    </td>
                    <td className="px-5 py-4">
                      {customer}
                      <div className="text-xs text-muted">{phone}</div>
                    </td>
                    <td className="px-5 py-4"><Badge tone={bookingTone(b.status)}>{BOOKING_LABEL[b.status]}</Badge></td>
                    <td className="px-5 py-4 tabular-nums">{formatINR(b.costSheet.total)}</td>
                    <td className="px-5 py-4 capitalize">{b.kycStatus}</td>
                    <td className="px-5 py-4 text-muted">{b.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
