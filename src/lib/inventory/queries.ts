import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import type { Actor } from "@/lib/auth/permissions";
import { listProjects, statusCounts } from "./service";
import type { Status } from "@/components/ui";

/** Projects visible to the actor with status counts and developer names, for dashboards. */
export async function projectsWithCounts(actor: Actor) {
  const db = await getDb();
  const [projects, counts, devs] = await Promise.all([listProjects(db, actor), statusCounts(db), db.query.developers.findMany({ orderBy: asc(s.developers.name) })]);
  return projects.map((p) => ({
    ...p,
    developer: devs.find((d) => d.id === p.developerId)?.name ?? "",
    counts: Object.fromEntries(counts.filter((c) => c.projectId === p.id).map((c) => [c.status, c.n])) as Partial<Record<Status, number>>,
  }));
}

export async function myHolds(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: s.units.id, number: s.units.number, holdExpiresAt: s.units.holdExpiresAt, project: s.projects.name, slug: s.projects.slug })
    .from(s.units)
    .innerJoin(s.projects, eq(s.units.projectId, s.projects.id))
    .where(eq(s.units.heldBy, userId))
    .orderBy(asc(s.units.holdExpiresAt));
  return rows.filter((r) => r.holdExpiresAt && r.holdExpiresAt > new Date());
}
