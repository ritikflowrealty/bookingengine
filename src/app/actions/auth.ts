"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createStaffSession, logoutStaff } from "@/lib/auth/session";
import { audit } from "@/lib/inventory/service";

export async function login(_: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(s.users.email, email) });
  // Same message for unknown email and wrong password, so accounts can't be enumerated.
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) return { error: "Email or password is incorrect" };
  await createStaffSession(user.id);
  await audit(db, { actorId: user.id, action: "auth.login", entity: "user", entityId: user.id });
  redirect(String(form.get("next") || "/app"));
}

export async function logout() {
  await logoutStaff();
  redirect("/login");
}
