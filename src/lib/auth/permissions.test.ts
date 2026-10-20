import { describe, expect, it } from "vitest";
import { assertCan, can, discountApprover, ForbiddenError, type TreeUser } from "./permissions";

const sm = { id: "sm", role: "sales_manager" as const, projectIds: ["sipani"] };

describe("can", () => {
  it("scopes sales managers to assigned projects", () => {
    expect(can(sm, "unit.hold", { projectId: "sipani" })).toBe(true);
    expect(can(sm, "unit.hold", { projectId: "solea" })).toBe(false);
  });
  it("hides internal prices from sales and pre-sales", () => {
    expect(can(sm, "inventory.view_internal", { projectId: "sipani" })).toBe(false);
    expect(can({ id: "p", role: "pre_sales", projectIds: ["sipani"] }, "booking.create", { projectId: "sipani" })).toBe(false);
    expect(can({ id: "l", role: "leadership", allProjects: true }, "inventory.view_internal", { projectId: "x" })).toBe(true);
  });
  it("developer users see only their developer and block only when allowed", () => {
    const dev = { id: "d", role: "developer_user" as const, developerIds: ["sipani-dev"] };
    expect(can(dev, "inventory.view", { developerId: "sipani-dev" })).toBe(true);
    expect(can(dev, "inventory.view", { developerId: "other" })).toBe(false);
    expect(can(dev, "inventory.block", { developerId: "sipani-dev" })).toBe(false);
    expect(can({ ...dev, canBlock: true }, "inventory.block", { developerId: "sipani-dev" })).toBe(true);
  });
  it("customers get no staff actions; super admin gets everything", () => {
    expect(can({ id: "c", role: "customer" }, "inventory.view")).toBe(false);
    expect(can({ id: "a", role: "super_admin" }, "pricelist.edit", { projectId: "any" })).toBe(true);
    expect(() => assertCan(sm, "pricelist.edit", { projectId: "sipani" })).toThrow(ForbiddenError);
  });
});

describe("discountApprover", () => {
  const users = new Map<string, TreeUser>([
    ["sm", { id: "sm", role: "sales_manager", managerId: "tl" }],
    ["tl", { id: "tl", role: "team_lead", managerId: "ld" }],
    ["ld", { id: "ld", role: "leadership", managerId: null }],
  ]);
  it("routes up the tree to the first manager whose limit covers it", () => {
    expect(discountApprover(users, "sm", 0)).toBeNull();
    expect(discountApprover(users, "sm", 50)?.id).toBe("tl");
    expect(discountApprover(users, "sm", 51)?.id).toBe("ld");
    expect(discountApprover(users, "tl", 40)).toBeNull();
  });
  it("throws when nobody in the chain can approve", () => {
    expect(() => discountApprover(users, "sm", 100, { team_lead: 50 })).toThrow(/No approver/);
  });
});
