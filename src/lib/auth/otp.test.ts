import { beforeAll, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { DB } from "@/db";
import { createOtp, normalizePhone, verifyOtp } from "./otp";

let db: DB;
beforeAll(async () => (db = await testDb()));

it("normalizes Indian numbers", () => {
  expect(normalizePhone("+91 98450 12345")).toBe("9845012345");
  expect(() => normalizePhone("12345")).toThrow();
});

it("verifies once, locks after 5 wrong tries, rate limits", async () => {
  const { code } = await createOtp(db, "9845000001");
  await expect(verifyOtp(db, "9845000001", "000000" === code ? "111111" : "000000")).rejects.toThrow(/4 tries left/);
  expect(await verifyOtp(db, "9845000001", code)).toBe("9845000001");
  await expect(verifyOtp(db, "9845000001", code)).rejects.toThrow(/expired/); // consumed

  const second = await createOtp(db, "9845000001");
  const wrong = second.code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await verifyOtp(db, "9845000001", wrong).catch(() => {});
  await expect(verifyOtp(db, "9845000001", second.code)).rejects.toThrow(/Too many wrong/);

  await createOtp(db, "9845000001");
  await expect(createOtp(db, "9845000001")).rejects.toThrow(/Too many codes/);
});
