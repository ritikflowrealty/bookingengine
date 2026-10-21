import fs from "node:fs";
import path from "node:path";
import { createElement as h, type ReactNode } from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import type { CostLine, CostSheet } from "@/lib/pricing/engine";
import { formatArea, formatDateTime, formatINR } from "@/lib/format";

// Written with createElement rather than JSX: tsconfig has jsx "preserve" (for Next), which vitest
// cannot execute, and this module is unit-tested.

export type CostSheetPdfInput = {
  sheet: Omit<CostSheet, "internal">; // customer view, never internal prices
  project: { name: string; developerName: string; reraNumbers: string[]; accentColor?: string | null; city?: string | null };
  unit: { number: string; typeLabel?: string | null; towerName?: string | null; floorLabel?: string | null; facing?: string | null; kind: "apartment" | "plot" | string };
  customerName?: string | null;
  preparedBy?: string | null; // sales manager name
  generatedAt: Date;
  validUntil?: Date | null;
  terms?: string[];
};

// Built-in Helvetica has no ₹ (or −), so DejaVu Sans is registered as a fallback family for those
// glyphs. public/fonts is the copy that ships with the app; the system path helps local dev.
const fontDir = [path.join(process.cwd(), "public/fonts"), "/usr/share/fonts/truetype/dejavu"].find(
  (d) => fs.existsSync(path.join(d, "DejaVuSans.ttf")) && fs.existsSync(path.join(d, "DejaVuSans-Bold.ttf")),
);
if (fontDir) {
  Font.register({
    family: "DejaVu Sans",
    fonts: [{ src: path.join(fontDir, "DejaVuSans.ttf") }, { src: path.join(fontDir, "DejaVuSans-Bold.ttf"), fontWeight: "bold" }],
  });
}
Font.registerHyphenationCallback((word) => [word]);
const FONT = fontDir ? ["Helvetica", "DejaVu Sans"] : "Helvetica";
/** Without a ₹-capable font, fall back to "Rs." rather than printing blank boxes. */
const t = (s: string) => (fontDir ? s : s.replace(/₹/g, "Rs. ").replace(/−/g, "-"));
const inr = (n: number) => t(formatINR(n));

const C = { ink: "#1C2033", magenta: "#C2276F", purple: "#7A2DB0", muted: "#6B6F80", line: "#E4E1EA", soft: "#F7F5FA" };

const s = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 9, color: C.ink, paddingTop: 32, paddingBottom: 64, paddingHorizontal: 40, lineHeight: 1.35 },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottomWidth: 0.75, borderBottomColor: C.line },
  wordmark: { fontSize: 11, fontWeight: "bold", letterSpacing: 3.2, color: C.magenta },
  docType: { fontSize: 7.5, letterSpacing: 2, color: C.muted },
  kicker: { marginTop: 18, fontSize: 7.5, letterSpacing: 1.6, color: C.muted },
  projectName: { marginTop: 4, fontSize: 24, lineHeight: 1.15, fontWeight: "bold", color: C.ink, letterSpacing: -0.3 },
  rule: { marginTop: 6, width: 44, height: 2.5 },
  dev: { marginTop: 8, fontSize: 9.5 },
  rera: { marginTop: 2, fontSize: 7.5, color: C.muted },
  card: { marginTop: 16, backgroundColor: C.soft, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", flexWrap: "wrap" },
  field: { width: "33.33%", paddingVertical: 4, paddingRight: 8 },
  fieldLabel: { fontSize: 6.5, letterSpacing: 1.1, color: C.muted },
  fieldValue: { marginTop: 1.5, fontSize: 9.5, fontWeight: "bold" },
  h2: { marginTop: 18, marginBottom: 2, fontSize: 7.5, fontWeight: "bold", letterSpacing: 1.6, color: C.purple },
  thead: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.75, borderBottomColor: C.ink, fontSize: 6.5, letterSpacing: 1.1, color: C.muted },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: C.line },
  grow: { flex: 1, paddingRight: 12 },
  formula: { marginTop: 1.5, fontSize: 7, color: C.muted },
  amount: { width: 92, textAlign: "right" },
  pct: { width: 44, textAlign: "right" },
  idx: { width: 18, color: C.muted },
  subtotal: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.75, borderBottomColor: C.ink, fontWeight: "bold" },
  total: { flexDirection: "row", alignItems: "center", marginTop: 6, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: C.purple, color: "#FFFFFF", borderRadius: 3, fontWeight: "bold", fontSize: 11 },
  totalNote: { marginTop: 4, fontSize: 7, color: C.muted, textAlign: "right" },
  terms: { marginTop: 3, fontSize: 7, color: C.muted, flexDirection: "row" },
  footer: { position: "absolute", left: 40, right: 40, bottom: 24, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.line, fontSize: 6.5, color: C.muted },
  footerRow: { flexDirection: "row", justifyContent: "space-between" },
  pageNo: { position: "absolute", right: 40, top: 841.89 - 24 - 6.5 * 1.35 - 2, width: 80, textAlign: "right", fontSize: 6.5, lineHeight: 1.35, color: C.muted },
});

type Kids = ReactNode[];
const view = (style: Style | Style[] | undefined, ...kids: Kids) => h(View, { style }, ...kids);
const text = (style: Style | Style[] | undefined, ...kids: Kids) => h(Text, { style }, ...kids);
const keepTogether = (style: Style | undefined, ...kids: Kids) => h(View, { style, wrap: false }, ...kids);

const field = (label: string, value?: string | null) =>
  value ? view(s.field, text(s.fieldLabel, label.toUpperCase()), text(s.fieldValue, t(value))) : null;

const amountRow = (label: string, amount: number, sub?: string | null) =>
  keepTogether(s.row, view(s.grow, text(undefined, t(label)), sub ? text(s.formula, t(sub)) : null), text(s.amount, inr(amount)));
const line = (l: CostLine) => amountRow(l.label, l.amount, l.formula);
const subtotal = (label: string, amount: number) => keepTogether(s.subtotal, text(s.grow, t(label)), text(s.amount, inr(amount)));
const head = (left: string, withPct = false) =>
  view(s.thead, withPct ? text(s.idx, "#") : null, text(s.grow, left), withPct ? text(s.pct, "%") : null, text(s.amount, "AMOUNT"));
const h2 = (title: string) => text(s.h2, title);
const list = <T,>(items: T[], f: (x: T, i: number) => ReactNode) => items.map((x, i) => h(View, { key: i }, f(x, i)));

export function CostSheetDocument({ sheet, project, unit, customerName, preparedBy, generatedAt, validUntil, terms }: CostSheetPdfInput) {
  const until = validUntil ?? (sheet.validityHours ? new Date(generatedAt.getTime() + sheet.validityHours * 3_600_000) : null);
  const validity = [sheet.validityHours && `Valid for ${sheet.validityHours} hours`, until && `until ${formatDateTime(until)}`].filter(Boolean).join(" · ");
  const unitLabel = unit.kind === "plot" ? "Plot" : "Unit";
  const kicker = [project.name, unit.towerName, `${unitLabel} ${unit.number}`].filter(Boolean).join("  ·  ").toUpperCase();
  // Lines grouped in order of appearance, each followed by its subtotal (if the price list defines one).
  const groups = [...new Set(sheet.lines.map((l) => l.group))];

  const header = [
    view(s.topbar, text(s.wordmark, "FLOW REALTY"), text(s.docType, `COST SHEET · ${formatDateTime(generatedAt).toUpperCase()}`)),
    text(s.kicker, kicker),
    text(s.projectName, project.name),
    view([s.rule, { backgroundColor: project.accentColor || C.magenta }]),
    text(s.dev, `by ${project.developerName}${project.city ? `  ·  ${project.city}` : ""}`),
    project.reraNumbers.length ? text(s.rera, `RERA: ${project.reraNumbers.join("  ·  ")}`) : null,
  ];

  const customer = view(
    s.card,
    field("Customer", customerName),
    field(unitLabel, [unit.towerName, unit.number].filter(Boolean).join(" · ")),
    field("Type", unit.typeLabel),
    field("Floor", unit.floorLabel),
    field("Facing", unit.facing),
    field(sheet.areaLabel, formatArea(sheet.area)),
    field("Base rate", `${formatINR(sheet.basePsf)} per sq ft`),
    field("Date", formatDateTime(generatedAt)),
    field("Prepared by", preparedBy),
  );

  const costs = [
    h2("COST BREAKUP"),
    head("PARTICULARS"),
    ...list(groups, (g) => {
      const sub = sheet.subtotals.find((x) => x.group === g);
      return [...list(sheet.lines.filter((l) => l.group === g), line), sub ? subtotal(sub.label, sub.amount) : null];
    }),
    sheet.gst ? amountRow(sheet.gst.label, sheet.gst.amount) : null,
    keepTogether(
      undefined,
      view(s.total, text(s.grow, t(sheet.totalLabel)), text([s.amount, { width: 120 }], inr(sheet.total))),
      text(s.totalNote, `Effective ${inr(sheet.effectivePsf)} per sq ft`),
    ),
  ];

  const registration = sheet.registration.length
    ? keepTogether(
        undefined,
        h2("TO BE PAID AT REGISTRATION"),
        head("PARTICULARS"),
        ...list(sheet.registration, line),
        sheet.registration.length > 1 ? subtotal("Total at registration", sheet.registrationTotal) : null,
      )
    : null;

  const payer = (p?: string) => (p === "bank" ? "Bank disbursement" : p === "own" ? "Own contribution" : p);
  const milestones = sheet.schedule.map((m, i) => {
    const note = [payer(m.payer), m.due].filter(Boolean).join(" · ");
    return keepTogether(
      s.row,
      text(s.idx, String(i + 1)),
      view(s.grow, text(undefined, t(m.label)), note ? text(s.formula, t(note)) : null),
      text(s.pct, m.percent ? `${+(m.percent * 100).toFixed(2)}%` : "—"),
      text(s.amount, inr(m.amount)),
    );
  });
  // Title, header and first two rows move together so the heading never sits orphaned at a page foot.
  const schedule = milestones.length
    ? view(undefined, keepTogether(undefined, h2("PAYMENT SCHEDULE"), head("MILESTONE", true), ...milestones.slice(0, 2)), ...milestones.slice(2))
    : null;

  const termsBlock = terms?.length
    ? keepTogether(undefined, h2("TERMS & CONDITIONS"), ...list(terms, (x, i) => view(s.terms, text({ width: 12 }, `${i + 1}.`), text({ flex: 1 }, t(x)))))
    : null;

  const footer = h(
    View,
    { style: s.footer, fixed: true },
    view(s.footerRow, text({ fontWeight: "bold", color: C.ink }, t(validity || "Subject to availability")), text(undefined, "Generated by Flow Inventory")),
    view([s.footerRow, { marginTop: 2 }], text(undefined, "Prices are indicative; final terms per agreement of sale.")),
  );
  // react-pdf measures render-prop text as empty, so it vanishes inside a flex row or when anchored by
  // `bottom`; a page-level Text with explicit width and `top` (A4 height) sits on the footer's second line.
  const pageNo = h(Text, { style: s.pageNo, fixed: true, render: ({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}` });

  return h(
    Document,
    { title: `Cost sheet · ${project.name} ${unit.number}`, author: "Flow Realty", creator: "Flow Inventory", producer: "Flow Inventory" },
    h(Page, { size: "A4", style: s.page }, ...header, customer, ...costs, registration, schedule, termsBlock, footer, pageNo),
  );
}

export async function renderCostSheetPdf(input: CostSheetPdfInput): Promise<Buffer> {
  return renderToBuffer(CostSheetDocument(input));
}
