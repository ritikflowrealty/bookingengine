import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { DEFAULT_DISCOUNT_LIMITS } from "@/lib/auth/permissions";
import { UNLIMITED } from "@/lib/admin/shared";
import type { ProjectFormValues } from "./ProjectForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Project by id for admin pages (shared by layout and page within one request). */
export const adminProject = cache(async (id: string) => {
  if (!UUID.test(id)) notFound();
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: eq(s.projects.id, id) });
  if (!project) notFound();
  const developer = await db.query.developers.findFirst({ where: eq(s.developers.id, project.developerId) });
  return { project, developer };
});

type Project = typeof s.projects.$inferSelect;
const limit = (v: number | undefined) => (v === undefined || v === null || v >= UNLIMITED || v === Infinity ? UNLIMITED : v);

export function projectFormValues(p?: Project): ProjectFormValues {
  const l = { ...DEFAULT_DISCOUNT_LIMITS, ...(p?.discountLimits ?? {}) };
  return {
    developerId: p?.developerId ?? null,
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    type: p?.type ?? "residential",
    city: p?.city ?? "Bengaluru",
    reraText: p?.reraNumbers.join(", ") ?? "",
    accentColor: p?.accentColor ?? "#7A2DB0",
    status: (p?.status as ProjectFormValues["status"]) ?? "active",
    totalitySiteUrl: p?.totalitySiteUrl ?? "",
    totalityEnvKey: p?.totalityEnvKey ?? "",
    waProvider: p?.waProvider ?? "none",
    waEnvKey: p?.waEnvKey ?? "",
    payuEnvKey: p?.payuEnvKey ?? "",
    holdHours: p?.holdHours ?? 24,
    checkoutHoldMinutes: p?.checkoutHoldMinutes ?? 15,
    tokenAmount: Number(p?.tokenAmount ?? 200000),
    gstPercent: +(Number(p?.gstRate ?? 0.05) * 100).toFixed(2),
    publicBooking: p?.publicBooking ?? false,
    discountLimits: { sales_manager: limit(l.sales_manager), team_lead: limit(l.team_lead), leadership: limit(l.leadership) },
  };
}
