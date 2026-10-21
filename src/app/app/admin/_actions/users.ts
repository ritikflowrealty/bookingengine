"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { audit } from "@/lib/inventory/service";
import { hashPassword } from "@/lib/auth/password";
import { ROLES } from "@/lib/auth/permissions";
import { adminUser, run, userError } from "@/lib/admin/guard";
import { createsCycle } from "@/lib/admin/users";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const userSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  phone: z.preprocess(blankToNull, z.string().trim().regex(/^\+?[0-9 -]{8,16}$/, "Enter a valid phone number").nullable()),
  role: z.enum(ROLES).refine((r) => r !== "customer", "Customers sign in with OTP; they aren't staff users"),
  managerId: z.preprocess(blankToNull, z.uuid().nullable()),
  allProjects: z.boolean(),
  projectIds: z.array(z.uuid()).max(500),
  developerId: z.preprocess(blankToNull, z.uuid().nullable()),
  canBlock: z.boolean(),
  active: z.boolean(),
  password: z.preprocess(blankToNull, z.string().min(8, "Password must be at least 8 characters").max(200).nullable()),
});
export type UserInput = z.input<typeof userSchema>;

export async function saveUserAction(id: string | null, input: UserInput) {
  return run(async () => {
    const me = await adminUser("users.manage");
    const v = userSchema.parse(input);
    if (!id && !v.password) throw userError("Set a password for the new user");
    if (v.role === "developer_user" && !v.developerId) throw userError("Pick the developer this user belongs to");
    if (id === me.id && (!v.active || v.role !== "super_admin")) throw userError("You can't deactivate or demote your own account", 409);
    const db = await getDb();
    const saved = await db.transaction(async (tx) => {
      const clash = await tx.query.users.findFirst({ where: id ? and(eq(s.users.email, v.email), ne(s.users.id, id)) : eq(s.users.email, v.email) });
      if (clash) throw userError(`${v.email} is already used by ${clash.name}`, 409);
      const all = await tx.select({ id: s.users.id, managerId: s.users.managerId }).from(s.users);
      if (v.managerId && !all.some((u) => u.id === v.managerId)) throw userError("Manager not found");
      if (id && createsCycle(all, id, v.managerId)) throw userError("That manager reports (directly or indirectly) to this user; pick someone above them", 409);

      const values = {
        name: v.name,
        email: v.email,
        phone: v.phone,
        role: v.role,
        managerId: v.managerId,
        allProjects: v.allProjects,
        developerId: v.role === "developer_user" ? v.developerId : null,
        canBlock: v.role === "developer_user" && v.canBlock,
        active: v.active,
        ...(v.password && { passwordHash: hashPassword(v.password) }),
      };
      const projectIds = v.allProjects ? [] : [...new Set(v.projectIds)];
      const before = id ? await tx.query.users.findFirst({ where: eq(s.users.id, id) }) : null;
      if (id && !before) throw userError("User not found", 404);
      const beforeProjects = id ? (await tx.select().from(s.userProjects).where(eq(s.userProjects.userId, id))).map((r) => r.projectId).sort() : [];
      const [u] = before ? await tx.update(s.users).set(values).where(eq(s.users.id, before.id)).returning() : await tx.insert(s.users).values(values).returning();
      await tx.delete(s.userProjects).where(eq(s.userProjects.userId, u.id));
      if (projectIds.length) await tx.insert(s.userProjects).values(projectIds.map((projectId) => ({ userId: u.id, projectId })));

      const view = (x: typeof u, projects: string[]) => ({ name: x.name, email: x.email, phone: x.phone, role: x.role, managerId: x.managerId, allProjects: x.allProjects, developerId: x.developerId, canBlock: x.canBlock, active: x.active, projects });
      const b = before ? view(before, beforeProjects) : null;
      const a = { ...view(u, projectIds.sort()), ...(v.password && { password: before ? "reset" : "set" }) };
      const keys = (Object.keys(a) as (keyof typeof a)[]).filter((k) => !b || JSON.stringify(b[k as keyof typeof b]) !== JSON.stringify(a[k]));
      await audit(tx, { actorId: me.id, action: before ? "user.update" : "user.create", entity: "user", entityId: u.id, before: b && Object.fromEntries(keys.map((k) => [k, b[k as keyof typeof b]])), after: Object.fromEntries(keys.map((k) => [k, a[k]])) });
      if (before && !v.active) await tx.delete(s.sessions).where(eq(s.sessions.userId, u.id)); // sign a deactivated user out everywhere
      return u;
    });
    revalidatePath("/app", "layout");
    return { id: saved.id };
  });
}
