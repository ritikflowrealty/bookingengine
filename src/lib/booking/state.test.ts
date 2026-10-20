import { describe, expect, it } from "vitest";
import { cancellationNeedsApproval, InvalidTransitionError, nextStatus, unitStatusFor, type BookingEvent, type BookingStatus } from "./state";

describe("booking state machine", () => {
  it("walks the happy path", () => {
    const events: BookingEvent[] = ["hold", "pay_token", "submit_form", "submit_kyc", "confirm", "sign_agreement", "register"];
    let s: BookingStatus = "draft";
    const seen = events.map((e) => (s = nextStatus(s, e)));
    expect(seen).toEqual(["held", "token_paid", "form_submitted", "kyc_submitted", "confirmed", "agreement", "registered"]);
  });
  it("rejects skipping steps and changes after registration or cancellation", () => {
    expect(() => nextStatus("held", "submit_form")).toThrow(InvalidTransitionError);
    expect(() => nextStatus("registered", "cancel")).toThrow(InvalidTransitionError);
    expect(() => nextStatus("cancelled", "hold")).toThrow(InvalidTransitionError);
    expect(() => nextStatus("token_paid", "expire")).toThrow(InvalidTransitionError);
  });
  it("only holds expire", () => expect(nextStatus("held", "expire")).toBe("cancelled"));
  it("cancellation approval after token", () => {
    expect(cancellationNeedsApproval("held")).toBe(false);
    expect(cancellationNeedsApproval("token_paid")).toBe(true);
  });
  it("maps to unit status", () => {
    expect(["held", "token_paid", "agreement", "registered", "cancelled"].map((b) => unitStatusFor(b as BookingStatus))).toEqual(["on_hold", "booked", "booked", "sold", "available"]);
  });
});
