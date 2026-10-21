import { expect, it } from "vitest";
import { mapBooking, mapLead } from "./totality";

it("maps a Totality lead, normalising the phone", () => {
  const l = mapLead("p1", { id: "123", name: " Demo ", mobile: "+91 99999-00001", source: "Website", sub_source: "Google Ads", sales_manager: "Sameer" });
  expect(l).toMatchObject({ projectId: "p1", totalityId: "123", name: "Demo", phone: "9999900001", source: "Website", subSource: "Google Ads", salesManagerName: "Sameer" });
});

it("maps a booking for the CRM", () => {
  expect(mapBooking({ id: "b1", status: "token_paid", tokenAmount: "200000.00", costSheet: { total: 10218450.66 } }, "153", { totalityId: "T9" })).toEqual({ lead_id: "T9", unit_no: "153", booking_ref: "b1", booking_status: "token_paid", token_amount: 200000, agreement_value: 10218451 });
});
