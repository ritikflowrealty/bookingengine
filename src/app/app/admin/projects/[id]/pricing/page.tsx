import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { formatDateTime } from "@/lib/format";
import { Badge, EmptyState } from "@/components/ui";
import { TableCard, td, th } from "../../../_components/blocks";
import { adminProject } from "../../data";
import { NewPriceList, PriceListActions } from "./PriceListActions";

const TONE = { active: "green", draft: "amber", archived: "neutral" } as const;
const date = (d: Date | null) => (d ? formatDateTime(d).split(",")[0] : "—");

export default async function PricingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  await adminProject(id);
  const db = await getDb();
  const lists = await db.query.priceLists.findMany({ where: eq(s.priceLists.projectId, id), orderBy: [desc(s.priceLists.createdAt), desc(s.priceLists.version)] });
  const order = { active: 0, draft: 1, archived: 2 };
  lists.sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted">Edit drafts, then activate. Activating archives the live version; bookings keep the cost sheet they were priced with.</p>
        <NewPriceList projectId={id} />
      </div>
      {lists.length === 0 ? (
        <EmptyState title="No price lists yet">Create a draft to define base rates, charges, GST and the payment plan.</EmptyState>
      ) : (
        <TableCard>
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Version</th>
                <th className={th}>Status</th>
                <th className={th}>Valid from</th>
                <th className={th}>Valid to</th>
                <th className={th}>Created</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {lists.map((l) => (
                <tr key={l.id} className="hover:bg-bg/60">
                  <td className={td}>
                    <Link href={`/app/admin/projects/${id}/pricing/${l.id}`} className="font-semibold hover:text-purple">{l.name}</Link>
                    <p className="text-xs text-muted">{l.config.charges.length} charges · {l.config.paymentPlan?.milestones.length ?? 0} milestones</p>
                  </td>
                  <td className={`${td} tabular-nums`}>v{l.version}</td>
                  <td className={td}><Badge tone={TONE[l.status]}>{l.status === "active" ? "Live" : l.status === "draft" ? "Draft" : "Archived"}</Badge></td>
                  <td className={td}>{date(l.validFrom)}</td>
                  <td className={td}>{date(l.validTo)}</td>
                  <td className={`${td} text-muted`}>{date(l.createdAt)}</td>
                  <td className={`${td} text-right`}>
                    <PriceListActions projectId={id} id={l.id} status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}
