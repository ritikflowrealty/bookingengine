"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, cx, Field, Input, Select } from "@/components/ui";
import { ROLES } from "@/lib/auth/permissions";
import { ROLE_LABEL } from "@/lib/admin/shared";
import { createsCycle } from "@/lib/admin/users";
import { saveUserAction } from "../_actions/users";
import { Alert, Section } from "../_components/blocks";
import { Toggle } from "../_components/kit";

export type UserFormValues = { name: string; email: string; phone: string; role: (typeof ROLES)[number]; managerId: string; allProjects: boolean; projectIds: string[]; developerId: string; canBlock: boolean; active: boolean };
type Option = { id: string; name: string };

export function UserForm({ id, initial, users, projects, developers, self }: { id: string | null; initial: UserFormValues; users: (Option & { managerId: string | null; role: string })[]; projects: Option[]; developers: Option[]; self: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof UserFormValues>(k: K, val: UserFormValues[K]) => (setV((p) => ({ ...p, [k]: val })), setSaved(false));
  // Managers that wouldn't create a loop.
  const managers = users.filter((u) => u.id !== id && !(id && createsCycle(users, id, u.id)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await saveUserAction(id, { ...v, password });
      if (!r.ok) return setError(r.error);
      setPassword("");
      setSaved(true);
      if (!id) router.push(`/app/admin/users/${r.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-24">
      <Section title="Profile">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Full name"><Input value={v.name} onChange={(e) => set("name", e.target.value)} required autoComplete="off" /></Field>
          <Field label="Email (sign-in)"><Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} required autoComplete="off" /></Field>
          <Field label="Phone"><Input type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98xxxxxxxx" /></Field>
          <Field label={id ? "Reset password" : "Password"} hint={id ? "Leave blank to keep the current password. Min 8 characters." : "Min 8 characters. Share it securely."}>
            <Input type="password" value={password} onChange={(e) => (setPassword(e.target.value), setSaved(false))} minLength={8} required={!id} autoComplete="new-password" />
          </Field>
        </div>
      </Section>

      <Section title="Role and reporting">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Role">
            <Select value={v.role} onChange={(e) => set("role", e.target.value as UserFormValues["role"])} disabled={self}>
              {ROLES.filter((r) => r !== "customer").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="Reports to" hint="People who report to this user aren't offered, so the tree can't loop.">
            <Select value={v.managerId} onChange={(e) => set("managerId", e.target.value)}>
              <option value="">No manager</option>
              {managers.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}</option>)}
            </Select>
          </Field>
          {v.role === "developer_user" && (
            <>
              <Field label="Developer">
                <Select value={v.developerId} onChange={(e) => set("developerId", e.target.value)} required>
                  <option value="" disabled>Choose…</option>
                  {developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <div className="self-end"><Toggle checked={v.canBlock} onChange={(b) => set("canBlock", b)} label="Can block units" hint="Developer, management or landowner blocks" /></div>
            </>
          )}
          <Toggle checked={v.active} onChange={(b) => set("active", b)} label="Active" hint={self ? "You can't deactivate yourself" : "Inactive users can't sign in"} disabled={self} />
        </div>
      </Section>

      <Section title="Project access" description={v.role === "developer_user" ? "Developer users see all projects of their developer." : undefined}>
        <Toggle checked={v.allProjects} onChange={(b) => set("allProjects", b)} label="All projects" hint="Company-wide access, including projects added later" />
        {!v.allProjects && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const on = v.projectIds.includes(p.id);
              return (
                <label key={p.id} className={cx("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition", on ? "border-purple bg-purple/[0.04]" : "border-line hover:border-ink/30")}>
                  <input type="checkbox" className="h-5 w-5 accent-purple" checked={on} onChange={(e) => set("projectIds", e.target.checked ? [...v.projectIds, p.id] : v.projectIds.filter((x) => x !== p.id))} />
                  {p.name}
                </label>
              );
            })}
          </div>
        )}
      </Section>

      <div className="sticky bottom-20 z-20 lg:bottom-4">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-lg backdrop-blur sm:p-3">
          <div className="min-w-0 flex-1">{error ? <Alert>{error}</Alert> : saved ? <Alert tone="success">Saved.</Alert> : <p className="px-2 text-sm text-muted">Changes are audited.</p>}</div>
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : id ? "Save user" : "Create user"}</Button>
        </div>
      </div>
    </form>
  );
}
