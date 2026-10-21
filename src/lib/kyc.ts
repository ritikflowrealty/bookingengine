import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived signed links for KYC files. The route also re-checks the viewer's role.
const secret = () => process.env.SESSION_SECRET ?? "demo-secret-not-for-production";
const sign = (id: string, exp: number) => createHmac("sha256", secret()).update(`${id}.${exp}`).digest("base64url");

export function signedKycUrl(docId: string, ttlSec = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `/api/kyc/${docId}?exp=${exp}&sig=${sign(docId, exp)}`;
}

export function verifyKycSignature(docId: string, exp: string | null, sig: string | null) {
  const e = Number(exp);
  if (!sig || !e || e < Date.now() / 1000) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(docId, e));
  return a.length === b.length && timingSafeEqual(a, b);
}

export { KYC_TYPES, KYC_MAX_BYTES, KYC_MIME } from "./kyc-types";
