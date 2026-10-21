// Client-safe KYC constants (no node imports).
export const KYC_TYPES = { pan: "PAN card", aadhaar: "Aadhaar", photo: "Photograph", address_proof: "Address proof", passport: "Passport (NRI)", oci: "OCI card (NRI)" } as const;
export const KYC_MAX_BYTES = 5 * 1024 * 1024;
export const KYC_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
