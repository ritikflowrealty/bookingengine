"use server";

import { isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { logoutCustomer } from "@/lib/auth/session";
import { audit } from "@/lib/inventory/service";

let failures = 0;
let lockedUntil = 0;

/** Staff PIN to leave kiosk mode. Any active staff member's kiosk PIN works; 5 wrong tries lock it for 5 minutes. */
export async function exitKioskAction(pin: string) {
  if (Date.now() < lockedUntil) return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  const db = await getDb();
  const staff = await db.query.users.findMany({ where: isNotNull(s.users.kioskPinHash) });
  const who = staff.find((u) => u.active && verifyPassword(pin, u.kioskPinHash));
  if (!who) {
    if (++failures >= 5) {
      lockedUntil = Date.now() + 5 * 60_000;
      failures = 0;
    }
    return { ok: false, error: "Wrong PIN" };
  }
  failures = 0;
  await logoutCustomer();
  await audit(db, { actorId: who.id, action: "kiosk.exit", entity: "user", entityId: who.id });
  return { ok: true };
}

export async function kioskResetAction() {
  await logoutCustomer();
}
