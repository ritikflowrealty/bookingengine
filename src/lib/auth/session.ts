import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { randomToken, sha256 } from "./password";
import type { Actor } from "./permissions";

const STAFF_COOKIE = "fi_staff";
const CUSTOMER_COOKIE = "fi_customer";
const STAFF_DAYS = 7;

async function create(cookie: string, values: { userId?: string; customerId?: string; kiosk?: boolean }, maxAgeSec: number) {
  const token = randomToken();
  const db = await getDb();
  await db.insert(s.sessions).values({ id: sha256(token), ...values, expiresAt: new Date(Date.now() + maxAgeSec * 1000) });
  (await cookies()).set(cookie, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: maxAgeSec });
}

async function read(cookie: string) {
  const token = (await cookies()).get(cookie)?.value;
  if (!token) return null;
  const db = await getDb();
  return (await db.query.sessions.findFirst({ where: and(eq(s.sessions.id, sha256(token)), gt(s.sessions.expiresAt, new Date())) })) ?? null;
}

async function destroy(cookie: string) {
  const jar = await cookies();
  const token = jar.get(cookie)?.value;
  if (token) await (await getDb()).delete(s.sessions).where(eq(s.sessions.id, sha256(token)));
  jar.delete(cookie);
}

export const createStaffSession = (userId: string) => create(STAFF_COOKIE, { userId }, STAFF_DAYS * 86400);
// Kiosk sessions are short; the kiosk shell also logs out after 2 minutes idle.
export const createCustomerSession = (customerId: string, kiosk = false) => create(CUSTOMER_COOKIE, { customerId, kiosk }, kiosk ? 15 * 60 : 7 * 86400);
export const logoutStaff = () => destroy(STAFF_COOKIE);
export const logoutCustomer = () => destroy(CUSTOMER_COOKIE);

export type StaffUser = typeof s.users.$inferSelect & { actor: Actor };

export async function currentStaff(): Promise<StaffUser | null> {
  const sess = await read(STAFF_COOKIE);
  if (!sess?.userId) return null;
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(s.users.id, sess.userId) });
  if (!user?.active) return null;
  const projects = await db.select({ id: s.userProjects.projectId }).from(s.userProjects).where(eq(s.userProjects.userId, user.id));
  return {
    ...user,
    actor: { id: user.id, role: user.role, allProjects: user.allProjects, projectIds: projects.map((p) => p.id), developerIds: user.developerId ? [user.developerId] : [], canBlock: user.canBlock },
  };
}

export async function requireStaff() {
  const u = await currentStaff();
  if (!u || u.role === "customer") redirect("/login");
  return u;
}

export async function currentCustomer() {
  const sess = await read(CUSTOMER_COOKIE);
  if (!sess?.customerId) return null;
  const db = await getDb();
  const c = await db.query.customers.findFirst({ where: eq(s.customers.id, sess.customerId) });
  return c ? { ...c, kiosk: sess.kiosk } : null;
}
