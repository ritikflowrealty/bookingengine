import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { sha256 } from "./password";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_10_MIN = 3;

export class OtpError extends Error {
  status = 400;
}

export const normalizePhone = (raw: string) => {
  const d = raw.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(d)) throw new OtpError("Enter a valid 10-digit Indian mobile number");
  return d;
};

/** Creates a challenge and returns the plain code for the caller to deliver (never stored in plain text). */
export async function createOtp(db: DB, phoneRaw: string) {
  const phone = normalizePhone(phoneRaw);
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.otpChallenges)
    .where(and(eq(s.otpChallenges.phone, phone), gt(s.otpChallenges.createdAt, new Date(Date.now() - 10 * 60_000))));
  if (recent.n >= OTP_MAX_PER_10_MIN) throw new OtpError("Too many codes requested. Try again in 10 minutes.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(s.otpChallenges).values({ phone, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  return { phone, code };
}

export async function verifyOtp(db: DB, phoneRaw: string, code: string) {
  const phone = normalizePhone(phoneRaw);
  const ch = await db.query.otpChallenges.findFirst({
    where: and(eq(s.otpChallenges.phone, phone), isNull(s.otpChallenges.consumedAt)),
    orderBy: desc(s.otpChallenges.createdAt),
  });
  if (!ch || ch.expiresAt < new Date()) throw new OtpError("Code expired. Request a new one.");
  if (ch.attempts >= OTP_MAX_ATTEMPTS) throw new OtpError("Too many wrong attempts. Request a new code.");
  if (ch.codeHash !== sha256(`${phone}:${code.trim()}`)) {
    await db.update(s.otpChallenges).set({ attempts: ch.attempts + 1 }).where(eq(s.otpChallenges.id, ch.id));
    throw new OtpError(`Wrong code. ${OTP_MAX_ATTEMPTS - ch.attempts - 1} tries left.`);
  }
  await db.update(s.otpChallenges).set({ consumedAt: new Date() }).where(eq(s.otpChallenges.id, ch.id));
  return phone;
}
