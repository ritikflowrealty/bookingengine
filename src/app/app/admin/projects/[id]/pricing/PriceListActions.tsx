"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Copy, Pencil, Plus, Rocket, Eye } from "lucide-react";
import { Button, ButtonLink, Input } from "@/components/ui";
import { activatePriceListAction, archivePriceListAction, createPriceListAction, duplicatePriceListAction } from "../../../_actions/pricing";

type R = { ok: true; data: unknown } | { ok: false; error: string };

export function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<R>, then?: (data: unknown) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      if (then) then(r.data);
      else router.refresh();
    });
  return { act, pending, error, router };
}

export function PriceListActions({ projectId, id, status, inEditor, dirty }: { projectId: string; id: string; status: "draft" | "active" | "archived"; inEditor?: boolean; dirty?: boolean }) {
  const { act, pending, error, router } = useAct();
  const href = `/app/admin/projects/${projectId}/pricing/${id}`;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error && <span className="mr-2 max-w-64 text-left text-xs text-[#b42318]">{error}</span>}
      {!inEditor && <ButtonLink href={href} variant="ghost" size="sm">{status === "draft" ? <><Pencil className="h-4 w-4" /> Edit</> : <><Eye className="h-4 w-4" /> View</>}</ButtonLink>}
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => duplicatePriceListAction(id), (d) => router.push(`/app/admin/projects/${projectId}/pricing/${(d as { id: string }).id}`))}>
        <Copy className="h-4 w-4" /> Duplicate
      </Button>
      {status !== "active" && (
        <Button variant="secondary" size="sm" disabled={pending || dirty} title={dirty ? "Save the draft first" : undefined} onClick={() => confirm("Make this the live price list? The current live version will be archived. Existing bookings are not affected.") && act(() => activatePriceListAction(id))}>
          <Rocket className="h-4 w-4" /> Activate
        </Button>
      )}
      {status === "draft" && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => archivePriceListAction(id))} aria-label="Archive">
          <Archive className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function NewPriceList({ projectId }: { projectId: string }) {
  const { act, pending, error, router } = useAct();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) return <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New price list</Button>;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => createPriceListAction(projectId, name), (d) => router.push(`/app/admin/projects/${projectId}/pricing/${(d as { id: string }).id}`));
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Diwali offer" autoFocus required className="sm:w-64" />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>Create draft</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {error && <span className="text-sm text-[#b42318]">{error}</span>}
    </form>
  );
}
