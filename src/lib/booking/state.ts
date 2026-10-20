// Booking lifecycle. The only way a booking's status changes is through `nextStatus()`.

export const BOOKING_STATUSES = ["draft", "held", "token_paid", "form_submitted", "kyc_submitted", "confirmed", "agreement", "registered", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type BookingEvent = "hold" | "pay_token" | "submit_form" | "submit_kyc" | "confirm" | "sign_agreement" | "register" | "cancel" | "expire";

const FLOW: Partial<Record<BookingStatus, Partial<Record<BookingEvent, BookingStatus>>>> = {
  draft: { hold: "held", cancel: "cancelled" },
  held: { pay_token: "token_paid", cancel: "cancelled", expire: "cancelled" },
  token_paid: { submit_form: "form_submitted", cancel: "cancelled" },
  form_submitted: { submit_kyc: "kyc_submitted", cancel: "cancelled" },
  kyc_submitted: { confirm: "confirmed", cancel: "cancelled" },
  confirmed: { sign_agreement: "agreement", cancel: "cancelled" },
  agreement: { register: "registered", cancel: "cancelled" },
};

export class InvalidTransitionError extends Error {
  status = 409;
}

export function nextStatus(from: BookingStatus, event: BookingEvent): BookingStatus {
  const to = FLOW[from]?.[event];
  if (!to) throw new InvalidTransitionError(`Cannot ${event} a booking that is ${from}`);
  return to;
}

/** Cancelling after the token is paid needs leadership approval; a lapsed hold or a draft does not. */
export const cancellationNeedsApproval = (from: BookingStatus) => !["draft", "held"].includes(from);

export const UNIT_STATUSES = ["available", "on_hold", "booked", "sold", "blocked"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

/** Unit status implied by its live booking. Cancelled → available (history stays on the booking). */
export function unitStatusFor(b: BookingStatus): UnitStatus {
  if (b === "held") return "on_hold";
  if (b === "registered") return "sold";
  if (b === "draft" || b === "cancelled") return "available";
  return "booked";
}
