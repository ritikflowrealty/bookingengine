import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { currentStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { quote } from "@/lib/inventory/service";
import { discountNeedsApproval } from "@/lib/inventory/discounts";
import { toCustomerView } from "@/lib/pricing/engine";
import { pdfResponse, unitCostSheetPdf } from "@/lib/pdf/forUnit";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentStaff();
  const db = await getDb();
  const unit = await db.query.units.findFirst({ where: eq(s.units.id, id) });
  if (!user || !unit || !can(user.actor, "costsheet.share", { projectId: unit.projectId })) return new Response("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const discountPsf = Math.max(0, Number(q.get("discount")) || 0);
  // Same limit check as the UI, so limits can't be bypassed by editing the URL.
  if (await discountNeedsApproval(db, user.id, id, unit.projectId, discountPsf)) return new Response("This discount needs approval", { status: 403 });
  const { sheet } = await quote(db, id, { offer: q.get("offer") ?? undefined, discount: discountPsf ? { psf: discountPsf, label: "Special discount" } : undefined });
  return pdfResponse(await unitCostSheetPdf(db, id, toCustomerView(sheet), { customerName: q.get("name"), preparedBy: user.name }));
}
