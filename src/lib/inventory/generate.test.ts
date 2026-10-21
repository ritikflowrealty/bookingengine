import { describe, expect, it } from "vitest";
import { floorLabel, formatUnitNumber, generateUnits } from "./generate";

describe("unit generation", () => {
  it("formats unit numbers like the sheets", () => {
    expect(formatUnitNumber("{tower}-{floor}{series:02}", "C", 14, 1)).toBe("C-1401");
    expect(formatUnitNumber("{tower}-{floor}{series:02}", "D", 0, 1)).toBe("D-001");
    expect(formatUnitNumber("{tower}-{floor}{series:02}", "E", 12, 7)).toBe("E-1207");
  });
  it("generates every floor × series and rejects ambiguous formats", () => {
    expect(generateUnits({ code: "C", floors: 3 }, [{ series: 1 }, { series: 2 }]).map((u) => u.number)).toEqual(["C-001", "C-002", "C-101", "C-102", "C-201", "C-202", "C-301", "C-302"]);
    expect(() => generateUnits({ code: "C", floors: 12, unitNumberFormat: "{tower}-{floor}{series}" }, Array.from({ length: 12 }, (_, i) => ({ series: i + 1 })))).toThrow(/duplicate/);
  });
  it("labels floors", () => expect([floorLabel(0), floorLabel(5), floorLabel(-1)]).toEqual(["G", "5", "B1"]));
});
