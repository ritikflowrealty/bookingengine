import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { pdfResponse, unitCostSheetPdf } from "@/lib/pdf/forUnit";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const link = await db.query.shareLinks.findFirst({ where: eq(s.shareLinks.token, token) });
  if (!link || link.expiresAt < new Date()) return new Response("This cost sheet link has expired", { status: 410 });
  const by = link.createdBy ? await db.query.users.findFirst({ where: eq(s.users.id, link.createdBy) }) : null;
  return pdfResponse(await unitCostSheetPdf(db, link.unitId, link.costSheet, { customerName: link.customerName, preparedBy: by?.name, validUntil: link.expiresAt }));
}
