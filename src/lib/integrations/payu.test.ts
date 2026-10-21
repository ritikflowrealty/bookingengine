import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { payuForm, verifyPayuResponse } from "./payu";

const c = { key: "testkey", salt: "testsalt" };
const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

it("builds the request hash in PayU's field order", () => {
  const f = payuForm(c, { txnid: "T1", amount: "100000.00", productinfo: "Token C-2104", firstname: "Demo", email: "d@example.com", phone: "9999900001", surl: "s", furl: "f", udf1: "b1" });
  expect(f.hash).toBe(sha512("testkey|T1|100000.00|Token C-2104|Demo|d@example.com|b1||||||||||testsalt"));
});

it("accepts only correctly signed responses", () => {
  const body: Record<string, string> = { status: "success", txnid: "T1", amount: "100000.00", productinfo: "Token C-2104", firstname: "Demo", email: "d@example.com", udf1: "b1" };
  body.hash = sha512("testsalt|success||||||||||b1|d@example.com|Demo|Token C-2104|100000.00|T1|testkey");
  expect(verifyPayuResponse(c, body)).toBe(true);
  expect(verifyPayuResponse(c, { ...body, amount: "1.00" })).toBe(false);
  expect(verifyPayuResponse(c, { ...body, hash: "" })).toBe(false);
});
