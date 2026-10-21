import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { currentCustomer } from "@/lib/auth/session";
import { getInventory, getProject } from "@/lib/inventory/service";
import { toClientUnit } from "@/lib/inventory/client-unit";
import { housekeep } from "@/lib/inventory/housekeeping";

// Customer-safe live inventory for the booking flow: statuses and public unit facts only.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  housekeep();
  if (!(await currentCustomer())) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const db = await getDb();
  const project = await getProject(db, slug);
  if (!project?.publicBooking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const inv = await getInventory(db, project.id, false);
  return NextResponse.json({ units: inv.units.map(toClientUnit) }, { headers: { "Cache-Control": "no-store" } });
}
