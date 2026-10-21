"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge, Button, Card, cx, EmptyState, Field, Input } from "@/components/ui";
import { formatUnitNumber } from "@/lib/inventory/generate";
import { parseAttrs, parseCell } from "@/lib/admin/units";
import { deleteTowerAction, generateUnitsAction, saveTowerAction, type TowerInput } from "../../../_actions/structure";
import { Alert, compactInput, td, th } from "../../../_components/blocks";
import { NumInput } from "../../../_components/kit";

type SeriesDraft = {
  key: string; series: number | undefined; bhk: string; typeLabel: string; description: string; facing: string; direction: string; view: string; tier: string;
  carpet?: number; balcony?: number; sbua?: number; uds?: number; corner: boolean; tags: string; attrs: string;
};
export type TowerDraft = { id: string | null; unitCount: number; name: string; code: string; floors: number; startFloor: number; basements: number; unitsPerFloor: number; unitNumberFormat: string; series: SeriesDraft[] };

const blankSeries = (n: number): SeriesDraft => ({ key: `new-${Math.random()}`, series: n, bhk: "", typeLabel: "", description: "", facing: "", direction: "", view: "", tier: "", corner: false, tags: "", attrs: "" });
const blankTower = (): TowerDraft => ({ id: null, unitCount: 0, name: "", code: "", floors: 10, startFloor: 0, basements: 0, unitsPerFloor: 4, unitNumberFormat: "{tower}-{floor}{series:02}", series: [1, 2, 3, 4].map(blankSeries) });

export function StructureEditor({ projectId, initial }: { projectId: string; initial: TowerDraft[] }) {
  const [added, setAdded] = useState<TowerDraft[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]); // towers added here stay mounted after the refresh brings them back
  return (
    <div className="space-y-6">
      {initial.length + added.length === 0 && <EmptyState title="No towers yet">Add a tower, describe its unit series, then generate the units in one go.</EmptyState>}
      {initial.filter((t) => !savedIds.includes(t.id!)).map((t) => <TowerCard key={t.id} projectId={projectId} initial={t} />)}
      {added.map((t, i) => <TowerCard key={i} projectId={projectId} initial={t} onSaved={(id) => setSavedIds((s) => [...s, id])} onRemove={() => setAdded((a) => a.filter((x) => x !== t))} />)}
      <Button variant="secondary" size="lg" onClick={() => setAdded((a) => [...a, blankTower()])} className="w-full border-dashed sm:w-auto">
        <Plus className="h-4 w-4" /> Add tower
      </Button>
    </div>
  );
}

type Preview = { planned: number; existing: number; toCreate: number; sample: string[]; created: number };

function TowerCard({ projectId, initial, onSaved, onRemove }: { projectId: string; initial: TowerDraft; onSaved?: (id: string) => void; onRemove?: () => void }) {
  const router = useRouter();
  const [t, setT] = useState(initial);
  const [dirty, setDirty] = useState(!initial.id);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof TowerDraft>(k: K, v: TowerDraft[K]) => (setT((p) => ({ ...p, [k]: v })), setDirty(true), setPreview(null));
  const setRow = (i: number, patch: Partial<SeriesDraft>) => set("series", t.series.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const seriesNos = t.series.map((r) => r.series ?? 0);
  const samples = (() => {
    try {
      const floors = [...new Set([t.startFloor, Math.min(t.startFloor + 1, t.floors), t.floors])];
      return floors.flatMap((f) => [seriesNos[0] ?? 1, seriesNos.at(-1) ?? 1].filter((x, i, a) => a.indexOf(x) === i).map((sn) => formatUnitNumber(t.unitNumberFormat, t.code || "A", f, sn)));
    } catch {
      return [];
    }
  })();
  const total = Math.max(0, t.floors - t.startFloor + 1) * t.series.length;

  function save() {
    start(async () => {
      setError(null);
      setNotice(null);
      const series: TowerInput["series"] = [];
      for (const r of t.series) {
        const tags = parseCell("tags", r.tags);
        let priceAttrs: Record<string, number>;
        try {
          priceAttrs = parseAttrs(r.attrs);
        } catch (e) {
          return setError(`Series ${r.series}: price attrs ${(e as Error).message}`);
        }
        if (r.series === undefined) return setError("Every series needs a number");
        series.push({ series: r.series, bhk: r.bhk, typeLabel: r.typeLabel, description: r.description, facing: r.facing, direction: r.direction, view: r.view, tier: r.tier, carpet: r.carpet ?? null, balcony: r.balcony ?? null, sbua: r.sbua ?? null, uds: r.uds ?? null, corner: r.corner, tags: tags.ok ? (tags.value as string[]) : [], priceAttrs });
      }
      const r = await saveTowerAction(projectId, t.id, { name: t.name, code: t.code, floors: t.floors, startFloor: t.startFloor, basements: t.basements, unitsPerFloor: t.unitsPerFloor, unitNumberFormat: t.unitNumberFormat, series });
      if (!r.ok) return setError(r.error);
      setDirty(false);
      setNotice("Tower saved.");
      if (!t.id) setT((p) => ({ ...p, id: r.data.id }));
      onSaved?.(r.data.id);
      router.refresh();
    });
  }

  function generate(apply: boolean) {
    if (!t.id) return;
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await generateUnitsAction(t.id!, apply);
      if (!r.ok) return setError(r.error);
      if (apply) {
        setPreview(null);
        setNotice(`Created ${r.data.created} units.`);
        setT((p) => ({ ...p, unitCount: p.unitCount + r.data.created }));
        router.refresh();
      } else setPreview(r.data);
    });
  }

  function remove() {
    if (!t.id) return onRemove?.();
    if (!confirm(`Delete tower ${t.name}?`)) return;
    start(async () => {
      const r = await deleteTowerAction(t.id!);
      if (!r.ok) return setError(r.error);
      onRemove?.();
      router.refresh();
    });
  }

  const num = (k: "floors" | "startFloor" | "basements" | "unitsPerFloor", label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumInput value={t[k]} onChange={(v) => set(k, v ?? 0)} />
    </Field>
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/50 px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple/10 text-purple"><Building className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-semibold">{t.name ? `Tower ${t.name}` : "New tower"}</h2>
            <p className="text-xs text-muted">{t.unitCount.toLocaleString("en-IN")} units exist · structure implies {total.toLocaleString("en-IN")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.unitCount === 0 && <Button variant="ghost" onClick={remove} disabled={pending} aria-label="Delete tower"><Trash2 className="h-4 w-4" /></Button>}
          <Button variant="secondary" onClick={() => generate(false)} disabled={pending || dirty || !t.id} title={dirty ? "Save the tower first" : undefined}>
            <Sparkles className="h-4 w-4" /> Generate units
          </Button>
          <Button onClick={save} disabled={pending || !dirty}>{pending ? "Working…" : "Save tower"}</Button>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-7">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {preview && (
          <div className="rounded-2xl border border-purple/25 bg-purple/[0.04] p-5">
            {preview.toCreate === 0 ? (
              <p className="text-sm">All {preview.planned} units already exist. Nothing to create.</p>
            ) : (
              <>
                <p className="font-medium">
                  {preview.toCreate} new {preview.toCreate === 1 ? "unit" : "units"} will be created
                  {preview.existing > 0 && <span className="text-muted"> · {preview.existing} already exist and stay untouched</span>}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {preview.sample.map((n) => <Badge key={n} tone="purple">{n}</Badge>)}
                  {preview.toCreate > preview.sample.length && <Badge>+{preview.toCreate - preview.sample.length} more</Badge>}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => generate(true)} disabled={pending}>Create {preview.toCreate} units</Button>
                  <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name"><Input value={t.name} onChange={(e) => set("name", e.target.value)} placeholder="DAPHNE" /></Field>
          <Field label="Code" hint="Used in unit numbers"><Input value={t.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="D" /></Field>
          {num("startFloor", "Start floor", "0 = ground")}
          {num("floors", "Top floor")}
          {num("basements", "Basements")}
          {num("unitsPerFloor", "Units per floor", t.series.length !== t.unitsPerFloor ? `Series table has ${t.series.length}` : undefined)}
          <div className="sm:col-span-2">
            <Field label="Unit number format" hint="{tower}, {floor}, {series:02} (pad to 2 digits)">
              <Input value={t.unitNumberFormat} onChange={(e) => set("unitNumberFormat", e.target.value)} className="font-mono" />
            </Field>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Preview:
              {samples.length ? samples.map((x) => <span key={x} className="rounded-md bg-ink/5 px-2 py-1 font-mono text-ink">{x}</span>) : <span className="text-[#b42318]">invalid format</span>}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Series</h3>
            <Button variant="secondary" size="sm" onClick={() => set("series", [...t.series, blankSeries(Math.max(0, ...seriesNos) + 1)])}><Plus className="h-4 w-4" /> Add series</Button>
          </div>
          <div className="-mx-5 overflow-x-auto border-y border-line sm:mx-0 sm:rounded-xl sm:border">
            <table className="min-w-full text-sm">
              <thead className="bg-bg/60">
                <tr>
                  {["No.", "BHK", "Type label", "Description", "Facing", "Direction", "View", "Tier", "Carpet", "Balcony", "SBUA", "UDS", "Corner", "Tags", "Price attrs (key=value)", ""].map((h) => <th key={h} className={cx(th, "px-2 first:pl-4")}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {t.series.map((r, i) => {
                  const txt = (k: "bhk" | "typeLabel" | "description" | "facing" | "direction" | "view" | "tier" | "tags" | "attrs", w: number, ph?: string) => (
                    <td className={cx(td, "px-2 py-2")}><input className={cx(compactInput, k === "attrs" && "font-mono text-xs")} style={{ width: w }} value={r[k]} onChange={(e) => setRow(i, { [k]: e.target.value })} placeholder={ph} aria-label={`Series ${r.series} ${k}`} /></td>
                  );
                  const nm = (k: "carpet" | "balcony" | "sbua" | "uds") => (
                    <td className={cx(td, "px-2 py-2")}><NumInput className={compactInput} style={{ width: 96 }} value={r[k]} onChange={(v) => setRow(i, { [k]: v })} aria-label={`Series ${r.series} ${k}`} /></td>
                  );
                  return (
                    <tr key={r.key}>
                      <td className={cx(td, "py-2 pr-2 pl-4")}><NumInput className={compactInput} style={{ width: 64 }} value={r.series} onChange={(v) => setRow(i, { series: v })} aria-label="Series number" /></td>
                      {txt("bhk", 112, "2BHK")}
                      {txt("typeLabel", 128)}
                      {txt("description", 192)}
                      {txt("facing", 96, "East")}
                      {txt("direction", 96)}
                      {txt("view", 112)}
                      {txt("tier", 112)}
                      {nm("carpet")}
                      {nm("balcony")}
                      {nm("sbua")}
                      {nm("uds")}
                      <td className={cx(td, "px-2 py-2 text-center")}><input type="checkbox" className="h-5 w-5 accent-purple" checked={r.corner} onChange={(e) => setRow(i, { corner: e.target.checked })} aria-label="Corner" /></td>
                      {txt("tags", 128, "east, park")}
                      {txt("attrs", 288, "sourcingPsf=6930, closingPsf=6830")}
                      <td className={cx(td, "px-2 py-2")}>
                        <button type="button" onClick={() => set("series", t.series.filter((_, j) => j !== i))} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-[#fef3f2] hover:text-[#b42318]" aria-label={`Remove series ${r.series}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Changing series doesn&apos;t touch existing units; edit those in the Units tab. Generating only adds unit numbers that don&apos;t exist yet.</p>
        </div>
      </div>
    </Card>
  );
}
