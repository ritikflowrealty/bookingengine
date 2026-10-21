import { renderCostSheetPdf } from "@/lib/pdf/CostSheetPdf";
import { sampleCostSheetPdfInput } from "@/lib/pdf/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sample cost-sheet PDF (fictional customer) for design review. */
export async function GET() {
  const pdf = await renderCostSheetPdf(sampleCostSheetPdfInput());
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="cost-sheet-C-2104.pdf"' },
  });
}
