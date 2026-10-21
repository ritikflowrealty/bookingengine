import { expect, it } from "vitest";
import { signedKycUrl, verifyKycSignature } from "./kyc";

it("signed KYC links verify, expire and resist tampering", () => {
  const u = new URL(signedKycUrl("doc1", 60), "http://x");
  expect(verifyKycSignature("doc1", u.searchParams.get("exp"), u.searchParams.get("sig"))).toBe(true);
  expect(verifyKycSignature("doc2", u.searchParams.get("exp"), u.searchParams.get("sig"))).toBe(false);
  expect(verifyKycSignature("doc1", String(Number(u.searchParams.get("exp")) + 1), u.searchParams.get("sig"))).toBe(false);
  const old = new URL(signedKycUrl("doc1", -1), "http://x");
  expect(verifyKycSignature("doc1", old.searchParams.get("exp"), old.searchParams.get("sig"))).toBe(false);
});
