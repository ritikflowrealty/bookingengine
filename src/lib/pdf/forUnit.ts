import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import type { CostSheet } from "@/lib/pricing/engine";
import { floorLabel } from "@/lib/inventory/generate";
import { renderCostSheetPdf } from "./CostSheetPdf";

const DEFAULT_TERMS = [
  "Prices are subject to change without notice at the developer's discretion.",
  "Applicable taxes at prevailing rates are collected with every instalment.",
  "TDS @ 1% is payable by the customer on each instalment if the cost (excluding tax) is ₹50 lakh or above.",
  "Stamp duty, registration and any other statutory levies are payable at actuals.",
];

/** Renders the branded PDF for a unit's (customer-view) cost sheet. */
export async function unitCostSheetPdf(db: DB, unitId: string, sheet: Omit<CostSheet, "internal">, opts: { customerName?: string | null; preparedBy?: string | null; validUntil?: Date | null; terms?: string[] }) {
  const unit = (await db.query.units.findFirst({ where: eq(s.units.id, unitId) }))!;
  const project = (await db.query.projects.findFirst({ where: eq(s.projects.id, unit.projectId) }))!;
  const [developer, tower] = await Promise.all([
    db.query.developers.findFirst({ where: eq(s.developers.id, project.developerId) }),
    unit.towerId ? db.query.towers.findFirst({ where: eq(s.towers.id, unit.towerId) }) : null,
  ]);
  const pdf = await renderCostSheetPdf({
    sheet,
    project: { name: project.name, developerName: developer?.name ?? "", reraNumbers: project.reraNumbers, accentColor: project.accentColor, city: project.city },
    unit: { number: unit.number, typeLabel: unit.bhk ?? unit.typeLabel, towerName: tower?.name ?? null, floorLabel: unit.kind === "plot" ? null : floorLabel(unit.floor ?? 0), facing: unit.facing, kind: unit.kind },
    customerName: opts.customerName,
    preparedBy: opts.preparedBy,
    generatedAt: new Date(),
    validUntil: opts.validUntil ?? (sheet.validityHours ? new Date(Date.now() + sheet.validityHours * 3600_000) : null),
    terms: opts.terms ?? DEFAULT_TERMS,
  });
  return { pdf, filename: `cost-sheet-${project.slug}-${unit.number}.pdf` };
}

export const pdfResponse = ({ pdf, filename }: { pdf: Buffer; filename: string }) =>
  new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" } });
