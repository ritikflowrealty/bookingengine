import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { currentStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getInventory } from "@/lib/inventory/service";
import { toClientUnit } from "@/lib/inventory/client-unit";

// Live inventory for open screens (polled every few seconds). Customers use the booking flow's own endpoint.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentStaff();
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  const scope = { projectId: id, developerId: project?.developerId };
  if (!user || !project || !can(user.actor, "inventory.view", scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const inv = await getInventory(db, id, can(user.actor, "inventory.view_internal", scope));
  return NextResponse.json({ version: inv.version, units: inv.units.map(toClientUnit) }, { headers: { "Cache-Control": "no-store" } });
}
