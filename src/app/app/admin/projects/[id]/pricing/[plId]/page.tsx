import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { bookedCount, pricingInput } from "@/lib/inventory/service";
import { adminProject } from "../../../data";
import { PriceListEditor } from "./PriceListEditor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function PriceListPage({ params }: { params: Promise<{ id: string; plId: string }> }) {
  await requireAdmin();
  const { id, plId } = await params;
  const { project } = await adminProject(id);
  if (!UUID.test(plId)) notFound();
  const db = await getDb();
  const list = await db.query.priceLists.findFirst({ where: and(eq(s.priceLists.id, plId), eq(s.priceLists.projectId, id)) });
  if (!list) notFound();
  const [units, booked] = await Promise.all([db.query.units.findMany({ where: eq(s.units.projectId, id) }), bookedCount(db, id)]);
  const preview = units
    .map((u) => ({ id: u.id, number: u.number, label: [u.number, u.bhk ?? u.typeLabel, u.tier].filter(Boolean).join(" · "), input: pricingInput(u) }))
    .sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));

  return (
    <PriceListEditor
      projectId={id}
      projectName={project.name}
      list={{ id: list.id, name: list.name, version: list.version, status: list.status, validFrom: day(list.validFrom), validTo: day(list.validTo), config: list.config }}
      units={preview}
      booked={booked}
    />
  );
}
