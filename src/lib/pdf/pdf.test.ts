import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/format";
import { renderCostSheetPdf } from "./CostSheetPdf";
import { sampleCostSheetPdfInput } from "./sample";

describe("formatINR", () => {
  it("uses Indian grouping and a true minus", () => {
    expect(formatINR(88_47_000)).toBe("₹88,47,000");
    expect(formatINR(-236)).toBe("−₹236");
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(-0.4)).toBe("₹0");
  });
});

describe("renderCostSheetPdf", () => {
  it("renders the Sipani C-2104 sample", async () => {
    const buf = await renderCostSheetPdf(sampleCostSheetPdfInput(new Date("2026-10-20T13:00:00Z")));
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(5 * 1024);
  }, 30_000);
});
