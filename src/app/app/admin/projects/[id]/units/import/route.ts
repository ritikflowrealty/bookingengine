import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { diffImport, parseUpload, readSheet } from "@/lib/admin/import";
import { loadUnitFields } from "@/lib/admin/units-db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Import step 1 (read-only): parse the uploaded sheet and return the diff preview.
 * A route handler rather than a server action because developer workbooks exceed the 1 MB action body limit.
 * Step 2 (apply) goes through saveUnitsAction, which re-validates every row.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  if (user.role !== "super_admin" || !UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: eq(s.projects.id, id) });
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to import" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "File is larger than 15 MB" }, { status: 400 });
  try {
    const sheet = readSheet(await parseUpload(file.name, await file.arrayBuffer()));
    const { fields } = await loadUnitFields(db, id);
    return Response.json({ mapped: sheet.mapped, ignored: sheet.ignored, rows: diffImport(sheet.records, fields) });
  } catch (e) {
    return Response.json({ error: `Couldn't read ${file.name}: ${(e as Error).message}` }, { status: 400 });
  }
}
