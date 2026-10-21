"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet, X } from "lucide-react";
import { Badge, Button, Card, cx } from "@/components/ui";
import type { DiffRow } from "@/lib/admin/import";
import { saveUnitsAction } from "../../../_actions/units";
import { Alert, td, th } from "../../../_components/blocks";
import { Pill } from "../../../_components/kit";

type Preview = { mapped: { header: string; to: string }[]; ignored: string[]; rows: DiffRow[] };
const KINDS = [
  { k: "changed", label: "Changed", tone: "amber" },
  { k: "new", label: "New", tone: "green" },
  { k: "error", label: "Errors", tone: "magenta" },
  { k: "unchanged", label: "Unchanged", tone: "neutral" },
] as const;

export function ImportPanel({ projectId, plotted, onDone, onClose }: { projectId: string; plotted: boolean; onDone: (msg: string) => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<DiffRow["kind"]>("changed");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function upload(f: File) {
    setFile(f);
    setPreview(null);
    start(async () => {
      setError(null);
      const body = new FormData();
      body.set("file", f);
      const r = await fetch(`/app/admin/projects/${projectId}/units/import`, { method: "POST", body });
      const data = (await r.json().catch(() => ({ error: "Upload failed" }))) as Preview & { error?: string };
      if (!r.ok || data.error) return setError(data.error ?? "Upload failed");
      setPreview(data);
      setTab((["changed", "new", "error"] as const).find((k) => data.rows.some((x) => x.kind === k)) ?? "unchanged");
    });
  }

  const count = (k: DiffRow["kind"]) => preview?.rows.filter((r) => r.kind === k).length ?? 0;
  const toApply = preview?.rows.filter((r) => r.kind === "new" || r.kind === "changed") ?? [];

  function apply() {
    start(async () => {
      setError(null);
      const r = await saveUnitsAction(projectId, toApply.map((x) => ({ id: x.id, patch: x.patch })));
      if (!r.ok) return setError(r.error);
      onDone(`Import applied: ${r.data.created} new, ${r.data.updated} updated${count("error") ? `, ${count("error")} rows with errors skipped` : ""}.`);
    });
  }

  const rows = preview?.rows.filter((r) => r.kind === tab) ?? [];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
        <div>
          <h2 className="text-lg font-semibold">Import {plotted ? "plots" : "units"}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Upload a CSV or XLSX. Rows are matched by unit number; empty cells leave values as they are. Developer headers work too ({plotted ? "S.NO, Area in SQFT, Facing, Avenue, Corner, Facing Charges, X%…" : "Flat No., S.B.U.A, CARPET (Sft), Closing, Sourcing, PLC, Car Park Value…"}). Nothing changes until you confirm.
          </p>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-ink/5" aria-label="Close import"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-5 p-5 sm:p-7">
        <label className={cx("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-bg/40 px-6 py-8 text-center transition hover:border-purple/50 hover:bg-purple/[0.03]", pending && "opacity-60")}>
          <FileSpreadsheet className="h-8 w-8 text-purple" strokeWidth={1.5} />
          <span className="font-medium">{file ? file.name : "Choose a .csv or .xlsx file"}</span>
          <span className="text-xs text-muted">{pending && !preview ? "Reading…" : "Tip: export first, edit in Excel, import back."}</span>
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {error && <Alert>{error}</Alert>}
        {preview && (
          <>
            <div className="text-xs text-muted">
              <span className="font-medium text-ink">Columns read:</span> {preview.mapped.map((m) => (m.header === m.to ? m.header : `${m.header} → ${m.to}`)).join(" · ")}
              {preview.ignored.length > 0 && <> · <span className="font-medium text-ink">Ignored:</span> {preview.ignored.join(", ")}</>}
            </div>
            <div className="flex flex-wrap gap-2">
              {KINDS.map(({ k, label }) => <Pill key={k} active={tab === k} onClick={() => setTab(k)}>{label} · {count(k)}</Pill>)}
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-bg">
                  <tr><th className={th}>Row</th><th className={th}>Unit</th><th className={th}>{tab === "error" ? "Problems" : "Changes"}</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((r) => (
                    <tr key={r.row}>
                      <td className={cx(td, "w-16 text-muted tabular-nums")}>{r.row}</td>
                      <td className={cx(td, "w-28 font-semibold")}>{r.number || "—"}</td>
                      <td className={td}>
                        {r.kind === "error" ? (
                          <ul className="space-y-0.5 text-[#b42318]">{r.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                        ) : r.changes.length ? (
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {r.changes.map((c) => (
                              <span key={c.field}>
                                <span className="text-muted">{c.field}:</span> {c.from && <s className="text-muted/80">{c.from}</s>} <span className="font-medium">{c.to || "—"}</span>
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-muted">No changes</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">No rows here.</p>}
              {rows.length > 500 && <p className="p-3 text-center text-xs text-muted">Showing the first 500 of {rows.length}.</p>}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">
                {toApply.length ? <>Will create <Badge tone="green">{count("new")}</Badge> and update <Badge tone="amber">{count("changed")}</Badge>{count("error") > 0 && <> · {count("error")} rows with errors are skipped</>}.</> : "Nothing to apply."}
              </p>
              <Button size="lg" onClick={apply} disabled={pending || !toApply.length}>{pending ? "Applying…" : `Apply ${toApply.length} ${toApply.length === 1 ? "row" : "rows"}`}</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
