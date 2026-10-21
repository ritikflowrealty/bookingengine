import { createHash, timingSafeEqual } from "node:crypto";

// PayU India hosted checkout. Success is trusted only from a callback whose reverse hash verifies.
export const payuUrl = () => (process.env.PAYU_MODE === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment");

export type PayuCreds = { key: string; salt: string };

export function payuCreds(envKey: string | null | undefined): PayuCreds | null {
  const key = envKey && process.env[`${envKey}_KEY`];
  const salt = envKey && process.env[`${envKey}_SALT`];
  return key && salt ? { key, salt } : null;
}

const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

export type PayuRequest = { txnid: string; amount: string; productinfo: string; firstname: string; email: string; phone: string; surl: string; furl: string; udf1?: string };

/** Fields to POST to PayU, including the request hash. */
export function payuForm(c: PayuCreds, r: PayuRequest) {
  const udf = [r.udf1 ?? "", "", "", "", ""];
  const hash = sha512([c.key, r.txnid, r.amount, r.productinfo, r.firstname, r.email, ...udf, "", "", "", "", "", c.salt].join("|"));
  return { key: c.key, ...r, udf1: udf[0], hash, service_provider: "payu_paisa" };
}

/** Verifies PayU's reverse hash on a callback/webhook body. */
export function verifyPayuResponse(c: PayuCreds, b: Record<string, string>) {
  const udf = [b.udf1, b.udf2, b.udf3, b.udf4, b.udf5].map((x) => x ?? "");
  const parts = [c.salt, b.status, "", "", "", "", "", ...udf.reverse(), b.email, b.firstname, b.productinfo, b.amount, b.txnid, c.key];
  if (b.additionalCharges) parts.unshift(b.additionalCharges);
  const expected = Buffer.from(sha512(parts.join("|")));
  const got = Buffer.from((b.hash ?? "").toLowerCase());
  return got.length === expected.length && timingSafeEqual(got, expected);
}
