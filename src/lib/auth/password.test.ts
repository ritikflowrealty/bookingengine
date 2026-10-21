import { expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

it("hashes and verifies passwords", () => {
  const h = hashPassword("flow@1234");
  expect(verifyPassword("flow@1234", h)).toBe(true);
  expect(verifyPassword("wrong", h)).toBe(false);
  expect(verifyPassword("flow@1234", null)).toBe(false);
});
