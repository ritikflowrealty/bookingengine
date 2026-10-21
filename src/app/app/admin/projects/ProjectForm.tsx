"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound } from "lucide-react";
import { Button, cx, Field, Input, Select } from "@/components/ui";
import { BRAND_SWATCHES, DISCOUNT_ROLES, humanize, PROJECT_STATUSES, PROJECT_TYPE_LABEL, PROJECT_TYPES, ROLE_LABEL, slugify, UNLIMITED, WA_PROVIDERS } from "@/lib/admin/shared";
import { saveProjectAction, type ProjectInput } from "../_actions/projects";
import { Alert, Section } from "../_components/blocks";
import { NumInput, Toggle } from "../_components/kit";

export type ProjectFormValues = {
  developerId: string | null;
  name: string;
  slug: string;
  type: (typeof PROJECT_TYPES)[number];
  city: string;
  reraText: string;
  accentColor: string;
  status: (typeof PROJECT_STATUSES)[number];
  totalitySiteUrl: string;
  totalityEnvKey: string;
  waProvider: (typeof WA_PROVIDERS)[number];
  waEnvKey: string;
  payuEnvKey: string;
  holdHours: number;
  checkoutHoldMinutes: number;
  tokenAmount: number;
  gstPercent: number;
  publicBooking: boolean;
  discountLimits: Record<(typeof DISCOUNT_ROLES)[number], number>;
};
const NEW_DEV = "__new__";

export function ProjectForm({ id, initial, developers }: { id: string | null; initial: ProjectFormValues; developers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const [devMode, setDevMode] = useState<string>(initial.developerId ?? (developers.length ? "" : NEW_DEV));
  const [newDev, setNewDev] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof ProjectFormValues>(k: K, val: ProjectFormValues[K]) => (setV((p) => ({ ...p, [k]: val })), setSaved(false));
  const setLimit = (role: (typeof DISCOUNT_ROLES)[number], n: number) => set("discountLimits", { ...v.discountLimits, [role]: n });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      setError(null);
      const { reraText, ...rest } = v;
      const input: ProjectInput = {
        ...rest,
        developerId: devMode === NEW_DEV ? null : devMode,
        newDeveloper: devMode === NEW_DEV ? newDev : null,
        reraNumbers: reraText.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
      };
      const r = await saveProjectAction(id, input);
      if (!r.ok) return setError(r.error);
      setSaved(true);
      if (!id) router.push(`/app/admin/projects/${r.data.id}/structure`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-24">
      <Section title="Basics" description="How the project appears across the app and on customer pages.">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Developer">
            <Select value={devMode} onChange={(e) => (setDevMode(e.target.value), setSaved(false))} required>
              <option value="" disabled>Choose a developer…</option>
              {developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value={NEW_DEV}>+ Add a new developer</option>
            </Select>
          </Field>
          {devMode === NEW_DEV ? (
            <Field label="New developer name">
              <Input value={newDev} onChange={(e) => setNewDev(e.target.value)} placeholder="e.g. Prestige Group" required autoFocus />
            </Field>
          ) : <div className="hidden md:block" />}
          <Field label="Project name">
            <Input value={v.name} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} placeholder="e.g. Sipani City" required />
          </Field>
          <Field label="Slug" hint={<>Used in links: /p/<b>{v.slug || "slug"}</b>/book</>}>
            <Input value={v.slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} required />
          </Field>
          <Field label="Type">
            <Select value={v.type} onChange={(e) => set("type", e.target.value as ProjectFormValues["type"])}>
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{PROJECT_TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="City">
            <Input value={v.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="Bengaluru" />
          </Field>
          <Field label="Status">
            <Select value={v.status} onChange={(e) => set("status", e.target.value as ProjectFormValues["status"])}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </Select>
          </Field>
          <Field label="RERA numbers" hint="Separate several with commas.">
            <Input value={v.reraText} onChange={(e) => set("reraText", e.target.value)} placeholder="PRM/KA/RERA/…" />
          </Field>
        </div>
        <div className="mt-5">
          <span className="mb-2 block text-sm font-medium">Accent colour</span>
          <div className="flex flex-wrap items-center gap-3">
            {BRAND_SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => set("accentColor", c)} className={cx("flex h-11 w-11 items-center justify-center rounded-full ring-offset-2 transition", v.accentColor.toUpperCase() === c ? "ring-2 ring-ink" : "hover:scale-105")} style={{ background: c }} aria-label={`Use ${c}`}>
                {v.accentColor.toUpperCase() === c && <Check className="h-5 w-5 text-white" />}
              </button>
            ))}
            <label className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface pr-4 pl-1.5 text-sm">
              <input type="color" value={v.accentColor} onChange={(e) => set("accentColor", e.target.value.toUpperCase())} className="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Custom colour" />
              <span className="font-mono text-xs">{v.accentColor.toUpperCase()}</span>
            </label>
          </div>
        </div>
      </Section>

      <Section title="Holds, token and GST">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Staff hold (hours)"><NumInput value={v.holdHours} onChange={(n) => set("holdHours", n ?? 0)} required /></Field>
          <Field label="Checkout hold (minutes)" hint="Customer self-booking"><NumInput value={v.checkoutHoldMinutes} onChange={(n) => set("checkoutHoldMinutes", n ?? 0)} required /></Field>
          <Field label="Token amount (₹)"><NumInput value={v.tokenAmount} onChange={(n) => set("tokenAmount", n ?? 0)} required /></Field>
          <Field label="GST rate (%)"><NumInput value={v.gstPercent} onChange={(n) => set("gstPercent", n ?? 0)} required /></Field>
        </div>
        <div className="mt-5 max-w-xl">
          <Toggle checked={v.publicBooking} onChange={(b) => set("publicBooking", b)} label="Public booking" hint="Customers can book online from the project's public page." />
        </div>
      </Section>

      <Section title="Discount limits" description="₹ PSF each role can give without approval. Larger discounts route up the reporting tree.">
        <div className="grid gap-4 md:grid-cols-3">
          {DISCOUNT_ROLES.map((role) => {
            const unlimited = v.discountLimits[role] >= UNLIMITED;
            return (
              <div key={role} className="rounded-xl border border-line p-4">
                <p className="text-sm font-medium">{ROLE_LABEL[role]}</p>
                <div className="mt-3 flex items-center gap-3">
                  <NumInput value={unlimited ? undefined : v.discountLimits[role]} onChange={(n) => setLimit(role, n ?? 0)} disabled={unlimited} placeholder={unlimited ? "Unlimited" : "0"} aria-label={`${ROLE_LABEL[role]} limit`} />
                  <span className="text-sm whitespace-nowrap text-muted">₹ PSF</span>
                </div>
                <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-purple" checked={unlimited} onChange={(e) => setLimit(role, e.target.checked ? UNLIMITED : 0)} />
                  Unlimited
                </label>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Integrations" description={<span className="inline-flex items-start gap-1.5"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-magenta" /> These fields store environment-variable NAMES only, never secrets. Put the actual keys in Vercel → Settings → Environment Variables.</span>}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Totality site URL"><Input type="url" value={v.totalitySiteUrl ?? ""} onChange={(e) => set("totalitySiteUrl", e.target.value)} placeholder="https://project.totalityre.com" /></Field>
          <Field label="Totality env-var prefix" hint={v.totalityEnvKey ? `Reads ${v.totalityEnvKey}_USER and ${v.totalityEnvKey}_PASSWORD` : "e.g. TOTALITY_SIPANI"}>
            <Input value={v.totalityEnvKey ?? ""} onChange={(e) => set("totalityEnvKey", e.target.value.toUpperCase())} placeholder="TOTALITY_PROJECT" className="font-mono" />
          </Field>
          <Field label="WhatsApp provider">
            <Select value={v.waProvider} onChange={(e) => set("waProvider", e.target.value as ProjectFormValues["waProvider"])}>
              {WA_PROVIDERS.map((p) => <option key={p} value={p}>{p === "none" ? "None" : p === "doubletick" ? "DoubleTick" : "Gallabox"}</option>)}
            </Select>
          </Field>
          <Field label="WhatsApp env-var prefix" hint={v.waProvider === "none" ? "Pick a provider first" : "e.g. GALLABOX_RIVERINE → _KEY / _SECRET"}>
            <Input value={v.waEnvKey ?? ""} onChange={(e) => set("waEnvKey", e.target.value.toUpperCase())} disabled={v.waProvider === "none"} placeholder="DOUBLETICK" className="font-mono" />
          </Field>
          <Field label="PayU env-var prefix" hint="e.g. PAYU_SIPANI → _KEY / _SALT">
            <Input value={v.payuEnvKey ?? ""} onChange={(e) => set("payuEnvKey", e.target.value.toUpperCase())} placeholder="PAYU_PROJECT" className="font-mono" />
          </Field>
        </div>
      </Section>

      <div className="sticky bottom-20 z-20 lg:bottom-4">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-lg backdrop-blur sm:p-3">
          <div className="min-w-0 flex-1">{error ? <Alert>{error}</Alert> : saved ? <Alert tone="success">Saved.</Alert> : <p className="px-2 text-sm text-muted">{id ? "Changes are audited." : "You'll set up towers or plots next."}</p>}</div>
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : id ? "Save project" : "Create project"}</Button>
        </div>
      </div>
    </form>
  );
}
