"use client";

import { memo, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, FileUp, RotateCcw, Search } from "lucide-react";
import { Badge, Button, buttonClass, cx, Input, Select, STATUS_LABEL, StatusBadge } from "@/components/ui";
import { FIELD, FIELDS, formatCell, MANUAL_STATUSES, parseCell, type FieldKey, type UnitFields, type UnitPatch } from "@/lib/admin/units";
import { saveUnitsAction } from "../../../_actions/units";
import { Alert } from "../../../_components/blocks";
import { ImportPanel } from "./ImportPanel";

type Row = UnitFields & { id: string };
type Edits = Partial<Record<FieldKey, string>>;
const PAGE = 100;

export function UnitsEditor({ projectId, plotted, units, towers, openImport }: { projectId: string; plotted: boolean; units: Row[]; towers: string[]; openImport: boolean }) {
  const router = useRouter();
  const cols = useMemo(() => FIELDS.filter((f) => f.only !== (plotted ? "apt" : "plot")), [plotted]);
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [tower, setTower] = useState("");
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(openImport);
  const [pending, start] = useTransition();

  const onEdit = useCallback((u: Row, key: FieldKey, raw: string) => {
    setNotice(null);
    setEdits((all) => {
      const row = { ...all[u.id] };
      if (raw === formatCell(FIELD[key].type, u[key])) delete row[key];
      else row[key] = raw;
      const next = { ...all, [u.id]: row };
      if (!Object.keys(row).length) delete next[u.id];
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return units.filter(
      (u) =>
        (!t || [u.number, u.typeLabel, u.bhk, u.facing, u.tier].some((v) => v?.toLowerCase().includes(t))) &&
        (!status || u.status === status) &&
        (!tower || u.towerCode === tower) &&
        (!onlyEdited || edits[u.id]),
    );
  }, [units, q, status, tower, onlyEdited, edits]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE, current * PAGE + PAGE);

  // Parse every edited cell; errors block saving and are shown on the cell.
  const parsed = useMemo(() => {
    const items: { id: string; patch: UnitPatch }[] = [];
    const errors: Record<string, Partial<Record<FieldKey, string>>> = {};
    let errorCount = 0;
    for (const [id, row] of Object.entries(edits)) {
      const patch: Record<string, unknown> = {};
      for (const [k, raw] of Object.entries(row) as [FieldKey, string][]) {
        const p = parseCell(FIELD[k].type, raw);
        if (p.ok) patch[k] = p.value;
        else {
          (errors[id] ??= {})[k] = p.error;
          errorCount++;
        }
      }
      if (patch.number === null) {
        (errors[id] ??= {}).number = "Unit number is required";
        errorCount++;
      }
      items.push({ id, patch: patch as UnitPatch });
    }
    return { items, errors, errorCount };
  }, [edits]);
  const editedUnits = Object.keys(edits).length;

  function save() {
    start(async () => {
      setError(null);
      const r = await saveUnitsAction(projectId, parsed.items);
      if (!r.ok) return setError(r.error);
      setEdits({});
      setNotice(`Saved changes to ${r.data.updated} ${r.data.updated === 1 ? "unit" : "units"}.`);
      router.refresh();
    });
  }

  const statusCounts = useMemo(() => units.reduce<Record<string, number>>((c, u) => ((c[u.status] = (c[u.status] ?? 0) + 1), c), {}), [units]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="font-medium text-ink">{units.length.toLocaleString("en-IN")} {plotted ? "plots" : "units"}</span>
          {Object.entries(statusCounts).map(([k, n]) => <span key={k}>· {n} {STATUS_LABEL[k as keyof typeof STATUS_LABEL].toLowerCase()}</span>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/app/admin/projects/${projectId}/units/export?format=csv`} className={buttonClass({ variant: "secondary" })}><Download className="h-4 w-4" /> CSV</a>
          <a href={`/app/admin/projects/${projectId}/units/export?format=xlsx`} className={buttonClass({ variant: "secondary" })}><Download className="h-4 w-4" /> XLSX</a>
          <Button variant={showImport ? "primary" : "secondary"} onClick={() => setShowImport((v) => !v)}><FileUp className="h-4 w-4" /> Import</Button>
        </div>
      </div>

      {showImport && <ImportPanel projectId={projectId} plotted={plotted} onDone={(msg) => (setNotice(msg), setShowImport(false), router.refresh())} onClose={() => setShowImport(false)} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_200px_160px_auto]">
        <label className="relative col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Search number, type, facing, tier…" className="pl-11" aria-label="Search units" />
        </label>
        <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(0))} aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        {!plotted && towers.length > 0 ? (
          <Select value={tower} onChange={(e) => (setTower(e.target.value), setPage(0))} aria-label="Filter by tower">
            <option value="">All towers</option>
            {towers.map((t) => <option key={t} value={t}>Tower {t}</option>)}
          </Select>
        ) : <span className="hidden lg:block" />}
        <label className="col-span-2 flex h-12 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface px-4 text-sm whitespace-nowrap lg:col-span-1">
          <input type="checkbox" className="h-5 w-5 accent-purple" checked={onlyEdited} onChange={(e) => (setOnlyEdited(e.target.checked), setPage(0))} />
          Edited only
        </label>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(28,32,51,0.04),0_8px_24px_-12px_rgba(28,32,51,0.08)]">
        <div className="max-h-[68vh] overflow-auto">
          <table className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {cols.map((c, i) => (
                  <th key={c.key} style={{ minWidth: c.width }} className={cx("sticky top-0 z-20 border-b border-line bg-bg px-2 py-3 text-left text-[11px] font-semibold tracking-[0.1em] whitespace-nowrap text-muted uppercase", i === 0 && "left-0 z-30 pl-4")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => <UnitRow key={u.id} u={u} cols={cols} edits={edits[u.id]} errors={parsed.errors[u.id]} onEdit={onEdit} />)}
            </tbody>
          </table>
          {shown.length === 0 && <p className="p-10 text-center text-sm text-muted">{units.length ? "No units match these filters." : "No units yet. Generate them from the structure tab or import a sheet."}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
          <span className="text-muted">
            {filtered.length ? `${current * PAGE + 1}–${Math.min(filtered.length, (current + 1) * PAGE)} of ${filtered.length.toLocaleString("en-IN")}` : "0 rows"}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 tabular-nums">Page {current + 1} / {pages}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">On hold, booked and sold come from holds and bookings and can&apos;t be changed here. Price attrs are key=value pairs, e.g. sourcingPsf=6930, closingPsf=6830.</p>

      {editedUnits > 0 && (
        <div className="sticky bottom-20 z-30 lg:bottom-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-lg backdrop-blur sm:p-3">
            <div className="flex flex-1 flex-wrap items-center gap-2 px-1 text-sm">
              <Badge tone="amber">{editedUnits} edited</Badge>
              {parsed.errorCount > 0 && <Badge tone="magenta">{parsed.errorCount} to fix</Badge>}
              {error && <span className="text-[#b42318]">{error}</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => (setEdits({}), setError(null))} disabled={pending}><RotateCcw className="h-4 w-4" /> Discard</Button>
              <Button onClick={save} disabled={pending || parsed.errorCount > 0} className="flex-1 sm:flex-none">{pending ? "Saving…" : "Save changes"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cell = "h-10 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-ink transition hover:border-line focus:border-purple focus:bg-surface focus:ring-2 focus:ring-purple/15 focus:outline-none disabled:cursor-not-allowed disabled:text-muted/60";

const UnitRow = memo(function UnitRow({ u, cols, edits, errors, onEdit }: { u: Row; cols: typeof FIELDS; edits?: Edits; errors?: Partial<Record<FieldKey, string>>; onEdit: (u: Row, k: FieldKey, raw: string) => void }) {
  const val = (k: FieldKey) => edits?.[k] ?? formatCell(FIELD[k].type, u[k]);
  const status = val("status");
  const manual = MANUAL_STATUSES.includes(u.status);
  return (
    <tr className="group">
      {cols.map((c, i) => {
        const dirty = edits?.[c.key] !== undefined;
        const err = errors?.[c.key];
        const box = cx("border-b border-line px-1 py-1", dirty && "bg-[#e0a100]/12", err && "bg-[#fef3f2]", i === 0 && "sticky left-0 z-10 pl-3", i === 0 && !dirty && !err && "bg-surface");
        const label = `${u.number} ${c.label}`;
        let input;
        if (c.type === "bool") {
          input = (
            <label className="flex h-10 items-center justify-center">
              <input type="checkbox" className="h-5 w-5 accent-purple" checked={val(c.key) === "Yes"} onChange={(e) => onEdit(u, c.key, e.target.checked ? "Yes" : "No")} aria-label={label} />
            </label>
          );
        } else if (c.type === "status") {
          input = manual ? (
            <select className={cx(cell, "font-medium")} value={status} onChange={(e) => onEdit(u, "status", e.target.value)} aria-label={label}>
              {MANUAL_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
            </select>
          ) : (
            <span className="flex h-10 items-center px-2" title="Set by holds and bookings"><StatusBadge status={u.status} /></span>
          );
        } else {
          input = (
            <input
              className={cx(cell, (c.type === "num" || c.type === "int") && "text-right tabular-nums", c.type === "attrs" && "font-mono text-xs", c.key === "number" && "font-semibold")}
              value={val(c.key)}
              disabled={c.key === "blockedReason" && status !== "blocked"}
              onChange={(e) => onEdit(u, c.key, e.target.value)}
              aria-label={label}
              aria-invalid={!!err}
              title={err}
            />
          );
        }
        return <td key={c.key} className={box} style={{ minWidth: c.width }}>{input}</td>;
      })}
    </tr>
  );
});
