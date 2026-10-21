import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { exportTable, toCsv } from "@/lib/admin/import";
import { loadUnitFields } from "@/lib/admin/units-db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  if (user.role !== "super_admin" || !UUID.test(id)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: eq(s.projects.id, id) });
  if (!project) return new Response("Not found", { status: 404 });
  const { fields } = await loadUnitFields(db, id);
  const { headers, rows } = exportTable(fields, project.type === "plotted");
  const stamp = new Date().toISOString().slice(0, 10);

  if (new URL(req.url).searchParams.get("format") === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Units", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
    ws.addRow(headers).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c, i) => (c.width = Math.max(10, Math.min(40, headers[i].length + 4))));
    const body = await wb.xlsx.writeBuffer();
    return new Response(body, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${project.slug}-units-${stamp}.xlsx"` } });
  }
  return new Response("﻿" + toCsv([headers, ...rows]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${project.slug}-units-${stamp}.csv"` } });
}
