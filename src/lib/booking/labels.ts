import type { BookingStatus } from "./state";

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  draft: "Draft",
  held: "Held · awaiting token",
  token_paid: "Token paid",
  form_submitted: "Form submitted",
  kyc_submitted: "KYC submitted",
  confirmed: "Confirmed",
  agreement: "Agreement",
  registered: "Registered",
  cancelled: "Cancelled",
};

export const BOOKING_STEPS: BookingStatus[] = ["held", "token_paid", "form_submitted", "kyc_submitted", "confirmed", "agreement", "registered"];

export const bookingTone = (s: BookingStatus) => (s === "cancelled" ? "neutral" : s === "held" ? "amber" : s === "registered" ? "purple" : s === "confirmed" || s === "agreement" ? "green" : "blue");
