"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm({ next, demo }: { next?: string; demo: boolean }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Work email">
        <Input name="email" type="email" autoComplete="username" required placeholder="you@flowrealty.in" defaultValue={demo ? "sales@flowrealty.in" : undefined} />
      </Field>
      <Field label="Password" error={state?.error}>
        <Input name="password" type="password" autoComplete="current-password" required defaultValue={demo ? "flow@1234" : undefined} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
