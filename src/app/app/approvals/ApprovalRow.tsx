"use client";

import { useState, useTransition } from "react";
import { Card, Button, Badge, Input } from "@/components/ui";
import { decideApprovalAction } from "@/app/actions/bookings";

export function ApprovalRow({ id, type, title, detail, requester, at, canDecide }: { id: string; type: string; title: string; detail: string; requester: string; at: string; canDecide: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideApprovalAction(id, approve, note);
      if (r.ok) setDone(approve ? "Approved" : "Rejected");
      else setError(r.error);
    });
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Badge tone="purple">{type}</Badge>
          <span className="text-xs text-muted">{new Date(at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
        </div>
        <p className="mt-2 font-semibold">{title}</p>
        <p className="text-sm">{detail}</p>
        <p className="text-xs text-muted">Requested by {requester}</p>
        {error && <p className="mt-1 text-sm text-[#b42318]">{error}</p>}
      </div>
      {done ? (
        <Badge tone={done === "Approved" ? "green" : "magenta"}>{done}</Badge>
      ) : canDecide ? (
        <div className="flex flex-col gap-2 sm:w-72">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment (optional)" className="h-10" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => decide(false)}>Reject</Button>
            <Button disabled={pending} onClick={() => decide(true)}>Approve</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
