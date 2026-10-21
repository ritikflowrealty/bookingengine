"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { audit } from "@/lib/inventory/service";
import { adminUser, run, userError } from "@/lib/admin/guard";
import { DISCOUNT_ROLES, PROJECT_STATUSES, PROJECT_TYPES, slugify, UNLIMITED, WA_PROVIDERS } from "@/lib/admin/shared";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const envKey = z.preprocess(blankToNull, z.string().trim().max(64).regex(/^[A-Z][A-Z0-9_]*$/, "Use an env-var NAME like TOTALITY_SIPANI (capitals, digits, _), never the secret itself").nullable());
const limit = z.number().min(0).max(UNLIMITED);

const projectSchema = z.object({
  developerId: z.preprocess(blankToNull, z.uuid().nullable()),
  newDeveloper: z.preprocess(blankToNull, z.string().trim().min(2).max(100).nullable()),
  name: z.string().trim().min(2, "Name is required").max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug: lowercase letters, digits and dashes").max(60),
  type: z.enum(PROJECT_TYPES),
  city: z.preprocess(blankToNull, z.string().trim().max(80).nullable()),
  reraNumbers: z.array(z.string().trim().min(3).max(100)).max(20),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
  status: z.enum(PROJECT_STATUSES),
  totalitySiteUrl: z.preprocess(blankToNull, z.url("Totality site URL must be a full https:// URL").nullable()),
  totalityEnvKey: envKey,
  waProvider: z.enum(WA_PROVIDERS),
  waEnvKey: envKey,
  payuEnvKey: envKey,
  holdHours: z.number().int().min(1).max(720),
  checkoutHoldMinutes: z.number().int().min(5).max(1440),
  tokenAmount: z.number().min(0).max(1e8),
  gstPercent: z.number().min(0).max(28),
  publicBooking: z.boolean(),
  discountLimits: z.object({ sales_manager: limit, team_lead: limit, leadership: limit }),
});
export type ProjectInput = z.input<typeof projectSchema>;

export async function saveProjectAction(id: string | null, input: ProjectInput) {
  return run(async () => {
    const user = await adminUser("project.manage");
    const v = projectSchema.parse(input);
    const db = await getDb();
    const saved = await db.transaction(async (tx) => {
      let developerId = v.developerId;
      if (v.newDeveloper) {
        const slug = slugify(v.newDeveloper);
        const found = await tx.query.developers.findFirst({ where: eq(s.developers.slug, slug) });
        if (found) developerId = found.id;
        else {
          const [d] = await tx.insert(s.developers).values({ name: v.newDeveloper, slug }).returning();
          await audit(tx, { actorId: user.id, action: "developer.create", entity: "developer", entityId: d.id, after: { name: d.name, slug } });
          developerId = d.id;
        }
      }
      if (!developerId) throw userError("Choose a developer or add a new one");
      const clash = await tx.query.projects.findFirst({ where: id ? and(eq(s.projects.slug, v.slug), ne(s.projects.id, id)) : eq(s.projects.slug, v.slug) });
      if (clash) throw userError(`Slug "${v.slug}" is already used by ${clash.name}`, 409);

      const values = {
        developerId,
        name: v.name,
        slug: v.slug,
        type: v.type,
        city: v.city,
        reraNumbers: v.reraNumbers,
        accentColor: v.accentColor.toUpperCase(),
        status: v.status,
        totalitySiteUrl: v.totalitySiteUrl,
        totalityEnvKey: v.totalityEnvKey,
        waProvider: v.waProvider,
        waEnvKey: v.waProvider === "none" ? null : v.waEnvKey,
        payuEnvKey: v.payuEnvKey,
        holdHours: v.holdHours,
        checkoutHoldMinutes: v.checkoutHoldMinutes,
        tokenAmount: String(v.tokenAmount),
        gstRate: String(+(v.gstPercent / 100).toFixed(4)),
        publicBooking: v.publicBooking,
        discountLimits: Object.fromEntries(DISCOUNT_ROLES.map((r) => [r, v.discountLimits[r]])),
      };
      if (!id) {
        const [p] = await tx.insert(s.projects).values(values).returning();
        await audit(tx, { actorId: user.id, action: "project.create", entity: "project", entityId: p.id, after: values });
        return p;
      }
      const [before] = await tx.select().from(s.projects).where(eq(s.projects.id, id)).for("update");
      if (!before) throw userError("Project not found", 404);
      if (before.type !== v.type && (await tx.$count(s.units, eq(s.units.projectId, id)))) throw userError("Type can't change once the project has units", 409);
      const [p] = await tx.update(s.projects).set({ ...values, updatedAt: new Date() }).where(eq(s.projects.id, id)).returning();
      const changed = (Object.keys(values) as (keyof typeof values)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(p[k]));
      await audit(tx, { actorId: user.id, action: "project.update", entity: "project", entityId: id, before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, p[k]])) });
      return p;
    });
    revalidatePath("/app", "layout");
    return { id: saved.id };
  });
}
