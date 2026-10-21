import { and, asc, eq, lte } from "drizzle-orm";
import type { DB } from "@/db";
import { DEMO } from "@/db";
import * as s from "@/db/schema";
import { sendTemplate, type WaProvider } from "./whatsapp";
import { pushBookingToTotality } from "./totality";

export const MAX_ATTEMPTS = 6;
/** Exponential backoff: 1, 2, 4, 8, 16 minutes. */
export const backoffMs = (attempt: number) => 60_000 * 2 ** Math.max(0, attempt - 1);

/** Processes due jobs from the Postgres queue. Called by the cron route. */
export async function runDueJobs(db: DB, limit = 20) {
  const due = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(s.syncJobs)
      .where(and(eq(s.syncJobs.status, "queued"), lte(s.syncJobs.runAfter, new Date())))
      .orderBy(asc(s.syncJobs.runAfter))
      .limit(limit)
      .for("update", { skipLocked: true });
    for (const r of rows) await tx.update(s.syncJobs).set({ status: "running", attempts: r.attempts + 1 }).where(eq(s.syncJobs.id, r.id));
    return rows;
  });
  let done = 0;
  for (const job of due) {
    const attempt = job.attempts + 1;
    try {
      const response = await perform(db, job);
      await db.update(s.syncJobs).set({ status: "done", lastError: null }).where(eq(s.syncJobs.id, job.id));
      await db.insert(s.syncLog).values({ jobId: job.id, direction: "out", request: job.payload, response: response ?? null, ok: true });
      done++;
    } catch (e) {
      const msg = (e as Error).message;
      await db
        .update(s.syncJobs)
        .set({ status: attempt >= MAX_ATTEMPTS ? "failed" : "queued", lastError: msg, runAfter: new Date(Date.now() + backoffMs(attempt)) })
        .where(eq(s.syncJobs.id, job.id));
      await db.insert(s.syncLog).values({ jobId: job.id, direction: "out", request: job.payload, response: { error: msg }, ok: false });
    }
  }
  return { picked: due.length, done };
}

async function perform(db: DB, job: typeof s.syncJobs.$inferSelect) {
  const project = job.projectId ? await db.query.projects.findFirst({ where: eq(s.projects.id, job.projectId) }) : null;
  if (DEMO) return { demo: true, skipped: "Demo mode: nothing is sent to WhatsApp or Totality" };
  if (job.kind === "wa.send") {
    const p = job.payload as { to: string; template: string; params: string[] };
    return sendTemplate({ provider: (project?.waProvider ?? "none") as WaProvider, envKey: project?.waEnvKey }, p.to, p.template, p.params);
  }
  if (job.kind === "totality.push_booking") return pushBookingToTotality(db, (job.payload as { bookingId: string }).bookingId);
  if (job.kind === "totality.create_lead") throw new Error("Totality lead creation not wired yet (needs Totality API reference)");
  throw new Error(`Unknown job kind ${job.kind}`);
}
