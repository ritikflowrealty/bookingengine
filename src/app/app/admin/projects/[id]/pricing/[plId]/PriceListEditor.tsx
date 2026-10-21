"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { Badge, Button, cx, Field, Input, Select } from "@/components/ui";
import { CostSheetView } from "@/components/CostSheetView";
import { computeCostSheet, type ChargeRule, type Condition, type Milestone, type PriceListConfig, type Rate, type UnitPricingInput } from "@/lib/pricing/engine";
import { configErrors, priceListConfigSchema } from "@/lib/admin/pricelist-config";
import { formatINR } from "@/lib/format";
import { savePriceListAction } from "../../../../_actions/pricing";
import { Alert, compactInput, Section } from "../../../../_components/blocks";
import { ListInput, NumInput, PctInput, Pill } from "../../../../_components/kit";
import { PriceListActions } from "../PriceListActions";

type ListMeta = { id: string; name: string; version: number; status: "draft" | "active" | "archived"; validFrom: string; validTo: string; config: PriceListConfig };
type PreviewUnit = { id: string; number: string; label: string; input: UnitPricingInput };

/** Drops undefined keys; an object left empty becomes undefined (so "no condition" isn't stored as {}). */
function clean<T extends object>(o: T): T | undefined {
  const e = Object.entries(o).filter(([, v]) => v !== undefined);
  return e.length ? (Object.fromEntries(e) as T) : undefined;
}
const move = <T,>(a: T[], i: number, d: number) => {
  const b = [...a];
  const j = i + d;
  if (j < 0 || j >= b.length) return b;
  [b[i], b[j]] = [b[j], b[i]];
  return b;
};

export function PriceListEditor({ projectId, projectName, list, units, booked }: { projectId: string; projectName: string; list: ListMeta; units: PreviewUnit[]; booked: number }) {
  const router = useRouter();
  const readOnly = list.status !== "draft";
  const [cfg, setCfg] = useState<PriceListConfig>(list.config);
  const [name, setName] = useState(list.name);
  const [validFrom, setValidFrom] = useState(list.validFrom);
  const [validTo, setValidTo] = useState(list.validTo);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"form" | "json">("form");
  const [json, setJson] = useState("");
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [bookings, setBookings] = useState(booked);
  const [offer, setOffer] = useState("");

  const update = (fn: (c: PriceListConfig) => PriceListConfig) => (setCfg(fn), setDirty(true), setNotice(null));
  const errors = useMemo(() => {
    const r = priceListConfigSchema.safeParse(cfg);
    if (!r.success) return r.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`);
    return configErrors(cfg);
  }, [cfg]);

  const offers = useMemo(() => [...new Set([...(cfg.base.adjustments ?? []).map((a) => a.when), ...cfg.charges.map((c) => c.when)].map((w) => w?.offer).filter((o): o is string => !!o))], [cfg]);
  const maxBookings = useMemo(() => {
    const marks = [...(cfg.base.adjustments ?? []), ...cfg.charges].flatMap((r) => [r.when?.bookingsAtLeast ?? 0, r.when?.bookingsBelow ?? 0]);
    return Math.max(100, booked + 20, ...marks.map((m) => m * 2));
  }, [cfg, booked]);
  const unit = units.find((u) => u.id === unitId);
  const preview = useMemo(() => {
    if (!unit) return { error: "This project has no units to preview yet." };
    try {
      return { sheet: computeCostSheet(cfg, unit.input, { bookingsCount: bookings, offer: offer || undefined }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [cfg, unit, bookings, offer]);

  function save() {
    start(async () => {
      setError(null);
      const r = await savePriceListAction(list.id, { name, validFrom: validFrom || null, validTo: validTo || null, config: cfg });
      if (!r.ok) return setError(r.error);
      setDirty(false);
      setNotice("Draft saved.");
      router.refresh();
    });
  }

  function openJson() {
    setJson(JSON.stringify(cfg, null, 2));
    setJsonErrors([]);
    setTab("json");
  }
  function applyJson() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      return setJsonErrors([`Not valid JSON: ${(e as Error).message}`]);
    }
    const r = priceListConfigSchema.safeParse(parsed);
    if (!r.success) return setJsonErrors(r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "config"}: ${i.message}`));
    const errs = configErrors(r.data as PriceListConfig);
    if (errs.length) return setJsonErrors(errs);
    update(() => r.data as PriceListConfig);
    setTab("form");
  }

  const groups = cfg.groups.map((g) => g.id);
  const lineIds = ["base", ...cfg.charges.map((c) => c.id)];

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/app/admin/projects/${projectId}/pricing`} className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink" aria-label="Back to price lists">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{list.name}</h2>
              <Badge tone={list.status === "active" ? "green" : list.status === "draft" ? "amber" : "neutral"}>v{list.version} · {list.status === "active" ? "Live" : list.status === "draft" ? "Draft" : "Archived"}</Badge>
            </div>
            {readOnly && <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted"><Lock className="h-3.5 w-3.5" /> Read-only. Duplicate it to make changes.</p>}
          </div>
        </div>
        <PriceListActions projectId={projectId} id={list.id} status={list.status} inEditor dirty={dirty} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <div className="flex gap-2">
            <Pill active={tab === "form"} onClick={() => (tab === "json" ? applyJson() : setTab("form"))}>Form</Pill>
            <Pill active={tab === "json"} onClick={openJson}>Advanced: JSON</Pill>
          </div>

          {tab === "json" ? (
            <Section title="Price list JSON" description="Edit the raw configuration. It's validated before it replaces the form.">
              <textarea value={json} onChange={(e) => setJson(e.target.value)} readOnly={readOnly} spellCheck={false} className="block h-[60vh] w-full rounded-xl border border-line bg-[#1C2033] p-4 font-mono text-xs leading-relaxed text-[#eef0f6] focus:border-purple focus:ring-4 focus:ring-purple/10 focus:outline-none" aria-label="Price list JSON" />
              {jsonErrors.length > 0 && <div className="mt-3"><Alert><ul className="list-disc pl-4">{jsonErrors.map((e) => <li key={e}>{e}</li>)}</ul></Alert></div>}
              {!readOnly && <div className="mt-4 flex gap-2"><Button onClick={applyJson}>Apply JSON</Button><Button variant="ghost" onClick={() => setTab("form")}>Discard</Button></div>}
            </Section>
          ) : (
            <fieldset disabled={readOnly} className="min-w-0 space-y-5">
              <Section title="Version">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-3"><Field label="Name"><Input value={name} onChange={(e) => (setName(e.target.value), setDirty(true))} /></Field></div>
                  <Field label="Valid from"><Input type="date" value={validFrom} onChange={(e) => (setValidFrom(e.target.value), setDirty(true))} /></Field>
                  <Field label="Valid to"><Input type="date" value={validTo} onChange={(e) => (setValidTo(e.target.value), setDirty(true))} /></Field>
                  <Field label="Quote validity (hours)" hint="Shared cost sheets expire after this"><NumInput value={cfg.validityHours} onChange={(v) => update((c) => ({ ...c, validityHours: v }))} /></Field>
                </div>
              </Section>

              <Section title="Area and base rate" description="Base PSF = base rate + every adjustment whose condition matches.">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Area basis">
                    <Select value={cfg.area.field} onChange={(e) => update((c) => ({ ...c, area: { ...c.area, field: e.target.value as PriceListConfig["area"]["field"] } }))}>
                      <option value="sbua">SBUA</option><option value="carpet">Carpet</option><option value="plotArea">Plot area</option>
                    </Select>
                  </Field>
                  <Field label="Area label"><Input value={cfg.area.label} onChange={(e) => update((c) => ({ ...c, area: { ...c.area, label: e.target.value } }))} /></Field>
                  <Field label="Plus terrace fraction" hint="e.g. 0.3333 adds a third of the terrace"><NumInput value={cfg.area.plusTerraceFraction} onChange={(v) => update((c) => ({ ...c, area: clean({ ...c.area, plusTerraceFraction: v }) ?? c.area }))} /></Field>
                  <Field label="Base line label"><Input value={cfg.base.label} onChange={(e) => update((c) => ({ ...c, base: { ...c.base, label: e.target.value } }))} /></Field>
                  <Field label="Base group"><GroupSelect groups={groups} value={cfg.base.group} onChange={(g) => update((c) => ({ ...c, base: { ...c.base, group: g } }))} /></Field>
                  <div className="sm:col-span-2 lg:col-span-3"><Field label="Base rate (₹ PSF)"><RateInput value={cfg.base.rate} onChange={(r) => update((c) => ({ ...c, base: { ...c.base, rate: r } }))} /></Field></div>
                </div>
                <h3 className="mt-6 mb-3 text-sm font-semibold">Adjustments</h3>
                <div className="space-y-3">
                  {(cfg.base.adjustments ?? []).map((a, i) => {
                    const setAdj = (p: Partial<typeof a>) => update((c) => ({ ...c, base: { ...c.base, adjustments: (c.base.adjustments ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)) } }));
                    return (
                      <Item key={i} onRemove={() => update((c) => ({ ...c, base: { ...c.base, adjustments: (c.base.adjustments ?? []).filter((_, j) => j !== i) } }))}>
                        <div className="grid gap-3 md:grid-cols-[1fr_minmax(0,1.2fr)]">
                          <Field label="Label"><Input className={compactInput} value={a.label} onChange={(e) => setAdj({ label: e.target.value })} placeholder="Platinum band premium" /></Field>
                          <Field label="Δ ₹ PSF (negative to reduce)"><RateInput value={a.delta} onChange={(r) => setAdj({ delta: r })} /></Field>
                        </div>
                        <ConditionEditor value={a.when} onChange={(w) => setAdj({ when: w })} />
                      </Item>
                    );
                  })}
                  <AddButton onClick={() => update((c) => ({ ...c, base: { ...c.base, adjustments: [...(c.base.adjustments ?? []), { label: "", delta: 0 }] } }))}>Add adjustment</AddButton>
                </div>
              </Section>

              <Section title="Charges" description="Lines added to the cost sheet, in this order.">
                <ChargeList items={cfg.charges} groups={groups} onChange={(charges) => update((c) => ({ ...c, charges }))} prefix="charge" />
              </Section>

              <Section title="Groups, GST and total">
                <div className="space-y-3">
                  {cfg.groups.map((g, i) => (
                    <div key={i} className="grid grid-cols-[96px_1fr_auto] items-end gap-3">
                      <Field label="Group id"><Input className={compactInput} value={g.id} onChange={(e) => update((c) => ({ ...c, groups: c.groups.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) }))} /></Field>
                      <Field label="Subtotal label (blank = no subtotal)"><Input className={compactInput} value={g.subtotalLabel ?? ""} onChange={(e) => update((c) => ({ ...c, groups: c.groups.map((x, j) => (j === i ? clean({ id: x.id, subtotalLabel: e.target.value || undefined })! : x)) }))} /></Field>
                      <IconButton label="Remove group" onClick={() => update((c) => ({ ...c, groups: c.groups.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  ))}
                  <AddButton onClick={() => update((c) => ({ ...c, groups: [...c.groups, { id: String.fromCharCode(65 + c.groups.length) }] }))}>Add group</AddButton>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Discount goes in group"><GroupSelect groups={groups} value={cfg.discountGroup} onChange={(g) => update((c) => ({ ...c, discountGroup: g }))} /></Field>
                  <Field label="GST rate (%)" hint="Blank = no GST line"><PctInput value={cfg.gst?.rate} onChange={(v) => update((c) => ({ ...c, gst: v === undefined ? undefined : { rate: v, label: c.gst?.label ?? `GST at ${+(v * 100).toFixed(2)}%` } }))} /></Field>
                  <Field label="GST label"><Input value={cfg.gst?.label ?? ""} disabled={!cfg.gst} onChange={(e) => update((c) => ({ ...c, gst: c.gst && { ...c.gst, label: e.target.value } }))} /></Field>
                  <Field label="Total label"><Input value={cfg.totalLabel} onChange={(e) => update((c) => ({ ...c, totalLabel: e.target.value }))} /></Field>
                </div>
              </Section>

              <Section
                title="Rounding"
                description="Rounds the GST-inclusive total down (largest matching step wins) and shows the difference as its own line."
                actions={<Button variant="secondary" size="sm" onClick={() => update((c) => ({ ...c, rounding: c.rounding ? undefined : { label: "Rounding adjustment", group: c.groups[0]?.id ?? "A", steps: [{ from: 0, step: 1000 }] } }))}>{cfg.rounding ? "Remove rounding" : "Add rounding"}</Button>}
              >
                {cfg.rounding ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Label"><Input value={cfg.rounding.label} onChange={(e) => update((c) => ({ ...c, rounding: { ...c.rounding!, label: e.target.value } }))} /></Field>
                      <Field label="Group"><GroupSelect groups={groups} value={cfg.rounding.group} onChange={(g) => update((c) => ({ ...c, rounding: { ...c.rounding!, group: g } }))} /></Field>
                    </div>
                    {cfg.rounding.steps.map((st, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                        <Field label="When total ≥ ₹"><NumInput className={compactInput} value={st.from} onChange={(v) => update((c) => ({ ...c, rounding: { ...c.rounding!, steps: c.rounding!.steps.map((x, j) => (j === i ? { ...x, from: v ?? 0 } : x)) } }))} /></Field>
                        <Field label="Round down to multiple of ₹"><NumInput className={compactInput} value={st.step} onChange={(v) => update((c) => ({ ...c, rounding: { ...c.rounding!, steps: c.rounding!.steps.map((x, j) => (j === i ? { ...x, step: v ?? 1 } : x)) } }))} /></Field>
                        <IconButton label="Remove step" onClick={() => update((c) => ({ ...c, rounding: { ...c.rounding!, steps: c.rounding!.steps.filter((_, j) => j !== i) } }))}><Trash2 className="h-4 w-4" /></IconButton>
                      </div>
                    ))}
                    <AddButton onClick={() => update((c) => ({ ...c, rounding: { ...c.rounding!, steps: [...c.rounding!.steps, { from: 1e7, step: 1e5 }] } }))}>Add step</AddButton>
                    <ConditionEditor value={cfg.rounding.when} onChange={(w) => update((c) => ({ ...c, rounding: clean({ ...c.rounding!, when: w })! }))} />
                  </div>
                ) : <p className="text-sm text-muted">No rounding.</p>}
              </Section>

              <Section title="Registration charges" description="Paid at registration, outside the agreement value.">
                <ChargeList items={cfg.registration ?? []} groups={["reg", ...groups]} onChange={(registration) => update((c) => ({ ...c, registration }))} prefix="reg" />
              </Section>

              <PaymentPlan cfg={cfg} lineIds={lineIds} update={update} />
            </fieldset>
          )}
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:self-start xl:overflow-y-auto">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs font-semibold tracking-[0.16em] text-magenta uppercase">Live preview</p>
            <div className="mt-3 space-y-3">
              <Field label="Unit">
                <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </Select>
              </Field>
              <label className="block">
                <span className="mb-1.5 flex justify-between text-sm font-medium"><span>Bookings so far</span><span className="tabular-nums text-purple">{bookings}</span></span>
                <input type="range" min={0} max={maxBookings} value={bookings} onChange={(e) => setBookings(Number(e.target.value))} className="h-8 w-full accent-purple" aria-label="Bookings so far" />
                <span className="text-xs text-muted">Drives &ldquo;first N bookings&rdquo; tiers. Actual: {booked}.</span>
              </label>
              {offers.length > 0 && (
                <Field label="Offer">
                  <Select value={offer} onChange={(e) => setOffer(e.target.value)}>
                    <option value="">Default</option>
                    {offers.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </Field>
              )}
            </div>
          </div>
          {"sheet" in preview && preview.sheet ? (
            <>
              <CostSheetView title={`${projectName} · ${unit?.number}`} sheet={preview.sheet} />
              {preview.sheet.internal?.closingPsf !== undefined && (
                <p className={cx("rounded-xl px-4 py-3 text-xs", preview.sheet.internal.belowClosing ? "bg-[#fef3f2] text-[#912018]" : "bg-ink/5 text-muted")}>
                  Internal: quoted ₹{Math.round(preview.sheet.internal.quotedPsf)} PSF vs closing ₹{preview.sheet.internal.closingPsf} PSF{preview.sheet.internal.belowClosing ? " (below closing)" : ""} · effective {formatINR(preview.sheet.effectivePsf)} PSF
                </p>
              )}
            </>
          ) : <Alert tone="info">{preview.error}</Alert>}
        </aside>
      </div>

      {!readOnly && (
        <div className="sticky bottom-20 z-30 mt-6 lg:bottom-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-lg backdrop-blur sm:p-3">
            <div className="min-w-0 flex-1 px-1 text-sm">
              {error ? <span className="text-[#b42318]">{error}</span> : errors.length ? <span className="text-[#b42318]">{errors.join(" · ")}</span> : notice ? <span className="text-[#1f6f40]">{notice}</span> : <span className="text-muted">{dirty ? "Unsaved changes" : "All changes saved"}</span>}
            </div>
            <Button size="lg" onClick={save} disabled={pending || !dirty || errors.length > 0 || tab === "json"}>{pending ? "Saving…" : "Save draft"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentPlan({ cfg, lineIds, update }: { cfg: PriceListConfig; lineIds: string[]; update: (fn: (c: PriceListConfig) => PriceListConfig) => void }) {
  const plan = cfg.paymentPlan;
  const total = (plan?.milestones ?? []).reduce((s, m) => s + m.percent, 0);
  const ok = Math.abs(total - 1) < 1e-9;
  const setPlan = (p: Partial<NonNullable<PriceListConfig["paymentPlan"]>>) => update((c) => ({ ...c, paymentPlan: { ...c.paymentPlan!, ...p } }));
  const setM = (i: number, p: Partial<Milestone>) => setPlan({ milestones: plan!.milestones.map((m, j) => (j === i ? (clean({ ...m, ...p }) as Milestone) : m)) });
  return (
    <Section
      title="Payment plan"
      description="Milestones as % of the total (minus excluded lines), plus optional fixed amounts."
      actions={!plan && <Button variant="secondary" size="sm" onClick={() => update((c) => ({ ...c, paymentPlan: { name: "Payment plan", milestones: [{ label: "On booking", percent: 1 }] } }))}>Add payment plan</Button>}
    >
      {plan ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan name"><Input value={plan.name} onChange={(e) => setPlan({ name: e.target.value })} /></Field>
            <Field label="Exclude lines from the basis" hint={`Line ids: ${lineIds.join(", ")}`}><ListInput value={plan.excludeLines} onChange={(v) => setPlan({ excludeLines: v })} placeholder="club" /></Field>
          </div>
          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Running total</span>
              <span className={cx("font-semibold tabular-nums", ok ? "text-[#1f6f40]" : "text-[#b42318]")}>{+(total * 100).toFixed(4)}% {ok ? "✓" : "· must be 100%"}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/5"><div className={cx("h-full rounded-full transition-all", ok ? "bg-[#2e9e5b]" : total > 1 ? "bg-magenta" : "bg-purple")} style={{ width: `${Math.min(100, total * 100)}%` }} /></div>
          </div>
          <div className="space-y-3">
            {plan.milestones.map((m, i) => {
              const running = plan.milestones.slice(0, i + 1).reduce((s, x) => s + x.percent, 0);
              return (
                <div key={i} className="rounded-xl border border-line p-3 sm:p-4">
                  <div className="grid grid-cols-3 gap-3 md:grid-cols-[minmax(0,2fr)_90px_120px_110px] md:items-end">
                    <div className="col-span-3 md:col-span-1"><Field label={`${i + 1}. Milestone`}><Input className={compactInput} value={m.label} onChange={(e) => setM(i, { label: e.target.value })} /></Field></div>
                    <Field label="%"><PctInput className={compactInput} value={m.percent} onChange={(v) => setM(i, { percent: v ?? 0 })} /></Field>
                    <Field label="Plus ₹"><NumInput className={compactInput} value={m.plus} onChange={(v) => setM(i, { plus: v })} /></Field>
                    <Field label="Payer">
                      <Select className={compactInput} value={m.payer ?? ""} onChange={(e) => setM(i, { payer: (e.target.value || undefined) as Milestone["payer"] })}>
                        <option value="">—</option><option value="own">Own</option><option value="bank">Bank</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="min-w-48 flex-1"><Field label="Due"><Input className={compactInput} value={m.due ?? ""} onChange={(e) => setM(i, { due: e.target.value || undefined })} placeholder="or Apr'27, whichever is later" /></Field></div>
                    <span className="pb-2.5 text-xs text-muted tabular-nums">Σ {+(running * 100).toFixed(2)}%</span>
                    <Reorder onUp={() => setPlan({ milestones: move(plan.milestones, i, -1) })} onDown={() => setPlan({ milestones: move(plan.milestones, i, 1) })} onRemove={() => setPlan({ milestones: plan.milestones.filter((_, j) => j !== i) })} />
                  </div>
                </div>
              );
            })}
            <AddButton onClick={() => setPlan({ milestones: [...plan.milestones, { label: "", percent: Math.max(0, +(1 - total).toFixed(6)) }] })}>Add milestone</AddButton>
          </div>
          <Button variant="ghost" size="sm" onClick={() => update((c) => ({ ...c, paymentPlan: undefined }))}>Remove payment plan</Button>
        </div>
      ) : <p className="text-sm text-muted">No payment plan.</p>}
    </Section>
  );
}

function ChargeList({ items, groups, onChange, prefix }: { items: ChargeRule[]; groups: string[]; onChange: (v: ChargeRule[]) => void; prefix: string }) {
  const set = (i: number, p: Partial<ChargeRule>) => onChange(items.map((c, j) => (j === i ? (clean({ ...c, ...p }) as ChargeRule) : c)));
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted">None.</p>}
      {items.map((c, i) => (
        <div key={i} className="rounded-xl border border-line p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[110px_minmax(0,2fr)_90px_110px]">
            <Field label="Id"><Input className={cx(compactInput, "font-mono")} value={c.id} onChange={(e) => set(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} /></Field>
            <Field label="Label"><Input className={compactInput} value={c.label} onChange={(e) => set(i, { label: e.target.value })} /></Field>
            <Field label="Group"><GroupSelect className={compactInput} groups={groups} value={c.group} onChange={(g) => set(i, { group: g })} /></Field>
            <Field label="Basis">
              <Select className={compactInput} value={c.basis} onChange={(e) => set(i, { basis: e.target.value as ChargeRule["basis"] })}>
                <option value="psf">Per sq ft</option><option value="fixed">Fixed ₹</option>
              </Select>
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-3 items-end gap-3">
            <div className="col-span-3"><Field label={c.basis === "psf" ? "Rate (₹ PSF)" : "Amount (₹)"}><RateInput value={c.rate} onChange={(r) => set(i, { rate: r })} /></Field></div>
            <Field label="Multiplier"><NumInput className={compactInput} value={c.multiplier} onChange={(v) => set(i, { multiplier: v })} placeholder="1" /></Field>
            <Field label="Tax incl. %"><PctInput className={compactInput} value={c.taxRate} onChange={(v) => set(i, { taxRate: v })} placeholder="0" /></Field>
            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
              <input type="checkbox" className="h-5 w-5 accent-purple" checked={!!c.gstExempt} onChange={(e) => set(i, { gstExempt: e.target.checked || undefined })} /> GST exempt
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><ConditionEditor value={c.when} onChange={(w) => set(i, { when: w })} /></div>
            <Reorder onUp={() => onChange(move(items, i, -1))} onDown={() => onChange(move(items, i, 1))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
      <AddButton onClick={() => onChange([...items, { id: `${prefix}_${items.length + 1}`, label: "", group: groups[0] ?? "A", basis: "psf", rate: 0 }])}>Add {prefix === "reg" ? "registration charge" : "charge"}</AddButton>
    </div>
  );
}

function RateInput({ value, onChange }: { value: Rate; onChange: (r: Rate) => void }) {
  const mode = typeof value === "number" ? "num" : "attr" in value ? "attr" : "floor";
  return (
    <div className="flex gap-2">
      <Select
        className={compactInput} style={{ width: 120, flex: "none" }}
        value={mode}
        onChange={(e) => onChange(e.target.value === "num" ? 0 : e.target.value === "attr" ? { attr: "" } : { floorRise: { perFloor: 0, fromFloor: 1 } })}
        aria-label="Rate type"
      >
        <option value="num">Fixed</option>
        <option value="attr">Unit attr</option>
        <option value="floor">Floor rise</option>
      </Select>
      {typeof value === "number" ? (
        <NumInput className={cx(compactInput, "min-w-0 flex-1")} value={value} onChange={(v) => onChange(v ?? 0)} aria-label="Rate" />
      ) : "attr" in value ? (
        <Input className={cx(compactInput, "min-w-0 flex-1 font-mono")} value={value.attr} onChange={(e) => onChange({ attr: e.target.value.trim() })} placeholder="sourcingPsf" aria-label="Unit attribute name" />
      ) : (
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <NumInput className={compactInput} value={value.floorRise.perFloor} onChange={(v) => onChange({ floorRise: { ...value.floorRise, perFloor: v ?? 0 } })} placeholder="₹/floor" aria-label="Per floor" title="₹ PSF per floor" />
          <NumInput className={compactInput} value={value.floorRise.fromFloor} onChange={(v) => onChange({ floorRise: { ...value.floorRise, fromFloor: v ?? 0 } })} placeholder="from floor" aria-label="From floor" title="Starting from floor" />
        </div>
      )}
    </div>
  );
}

function describe(c?: Condition) {
  if (!c) return "Always applies";
  const parts = [
    c.tiers && `tier ${c.tiers.join("/")}`,
    c.tagsAny && `any tag ${c.tagsAny.join("/")}`,
    c.tagsAll && `all tags ${c.tagsAll.join("+")}`,
    c.offer && `offer "${c.offer}"`,
    c.bookingsAtLeast !== undefined && `after ${c.bookingsAtLeast} bookings`,
    c.bookingsBelow !== undefined && `first ${c.bookingsBelow} bookings`,
    c.areaIn && `area in ${c.areaIn.join(", ")}`,
    c.minFloor !== undefined && `floor ≥ ${c.minFloor}`,
  ].filter(Boolean);
  return `Only when ${parts.join(" · ")}`;
}

function ConditionEditor({ value, onChange }: { value?: Condition; onChange: (c: Condition | undefined) => void }) {
  const c = value ?? {};
  const set = (p: Partial<Condition>) => onChange(clean({ ...c, ...p }));
  return (
    <details className="group rounded-lg bg-bg/60 px-3 py-2 open:pb-3">
      <summary className="flex min-h-8 cursor-pointer items-center text-sm text-muted select-none">
        <span className={cx(value && "font-medium text-royal")}>{describe(value)}</span>
        <span className="ml-2 text-xs underline-offset-2 group-open:hidden hover:underline">edit condition</span>
      </summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Tiers"><ListInput className={compactInput} value={c.tiers} onChange={(v) => set({ tiers: v })} placeholder="Platinum" /></Field>
        <Field label="Any of tags"><ListInput className={compactInput} value={c.tagsAny} onChange={(v) => set({ tagsAny: v })} placeholder="east, corner" /></Field>
        <Field label="All of tags"><ListInput className={compactInput} value={c.tagsAll} onChange={(v) => set({ tagsAll: v })} /></Field>
        <Field label="Offer"><Input className={compactInput} value={c.offer ?? ""} onChange={(e) => set({ offer: e.target.value.trim() || undefined })} placeholder="no_offer" /></Field>
        <Field label="Bookings at least"><NumInput className={compactInput} value={c.bookingsAtLeast} onChange={(v) => set({ bookingsAtLeast: v })} /></Field>
        <Field label="Bookings below"><NumInput className={compactInput} value={c.bookingsBelow} onChange={(v) => set({ bookingsBelow: v })} /></Field>
        <Field label="Area in (sq ft)"><ListInput<number> numeric className={compactInput} value={c.areaIn} onChange={(v) => set({ areaIn: v })} placeholder="1065, 1280" /></Field>
        <Field label="Min floor"><NumInput className={compactInput} value={c.minFloor} onChange={(v) => set({ minFloor: v })} /></Field>
      </div>
    </details>
  );
}

function GroupSelect({ groups, value, onChange, className }: { groups: string[]; value: string; onChange: (g: string) => void; className?: string }) {
  const all = groups.includes(value) ? groups : [value, ...groups];
  return (
    <Select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {all.map((g) => <option key={g} value={g}>{g}</option>)}
    </Select>
  );
}

function Item({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="relative rounded-xl border border-line p-3 pr-14 sm:p-4 sm:pr-16">
      <div className="space-y-3">{children}</div>
      <div className="absolute top-3 right-3"><IconButton label="Remove" onClick={onRemove}><Trash2 className="h-4 w-4" /></IconButton></div>
    </div>
  );
}

function Reorder({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex gap-1">
      <IconButton label="Move up" onClick={onUp}><ArrowUp className="h-4 w-4" /></IconButton>
      <IconButton label="Move down" onClick={onDown}><ArrowDown className="h-4 w-4" /></IconButton>
      <IconButton label="Remove" onClick={onRemove} danger><Trash2 className="h-4 w-4" /></IconButton>
    </div>
  );
}

function IconButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cx("flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted transition disabled:opacity-40", danger ? "hover:border-[#f1c4bf] hover:bg-[#fef3f2] hover:text-[#b42318]" : "hover:bg-ink/5 hover:text-ink")}>
      {children}
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-medium text-muted transition hover:border-purple hover:bg-purple/[0.03] hover:text-purple disabled:hidden">
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}
