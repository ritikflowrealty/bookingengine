import type { CostSheet } from "@/lib/pricing/engine";

const inr = (n: number) => (n < 0 ? "−₹" : "₹") + Math.abs(Math.round(n)).toLocaleString("en-IN");

/** Renders a customer-safe cost sheet. Pass the result of toCustomerView() for customers. */
export function CostSheetView({ title, sheet, compact }: { title: string; sheet: Omit<CostSheet, "internal">; compact?: boolean }) {
  const row = "flex justify-between gap-4 py-2 border-b border-line";
  return (
    <section className={compact ? "" : "rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-8"}>
      <h2 className={compact ? "text-base font-semibold" : "text-xl font-semibold"}>{title}</h2>
      <p className="mt-1 text-sm text-muted">
        {sheet.areaLabel}: {sheet.area.toLocaleString("en-IN")} · Base ₹{sheet.basePsf.toLocaleString("en-IN")} PSF
        {sheet.validityHours ? ` · Valid for ${sheet.validityHours} hours` : ""}
      </p>
      <div className="mt-4 text-sm">
        {sheet.lines.map((l) => (
          <div key={l.id} className={row}>
            <div>
              <div>{l.label}</div>
              <div className="text-xs text-muted">{l.formula}</div>
            </div>
            <div className="tabular-nums">{inr(l.amount)}</div>
          </div>
        ))}
        {sheet.subtotals.map((s) => (
          <div key={s.group} className={`${row} font-medium`}>
            <div>{s.label}</div>
            <div className="tabular-nums">{inr(s.amount)}</div>
          </div>
        ))}
        {sheet.gst && (
          <div className={row}>
            <div>{sheet.gst.label}</div>
            <div className="tabular-nums">{inr(sheet.gst.amount)}</div>
          </div>
        )}
        <div className="flex justify-between gap-4 py-3 text-base font-semibold text-purple">
          <div>{sheet.totalLabel}</div>
          <div className="tabular-nums">{inr(sheet.total)}</div>
        </div>
      </div>
      {sheet.registration.length > 0 && (
        <>
          <h3 className="mt-4 font-medium">To be paid at registration</h3>
          <div className="text-sm">
            {sheet.registration.map((l) => (
              <div key={l.id} className={row}>
                <div>{l.label}</div>
                <div className="tabular-nums">{inr(l.amount)}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {sheet.schedule.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer font-medium">Payment schedule</summary>
          <div className="text-sm">
            {sheet.schedule.map((m, i) => (
              <div key={i} className={row}>
                <div>
                  {m.label}
                  {m.percent ? <span className="text-muted"> · {+(m.percent * 100).toFixed(2)}%</span> : null}
                </div>
                <div className="tabular-nums">{inr(m.amount)}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
