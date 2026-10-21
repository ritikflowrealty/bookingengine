import "server-only";
import { getDb } from "@/db";
import { expireHolds } from "./service";
import { runDueJobs } from "@/lib/integrations/worker";

// Vercel Hobby crons run once a day, so live traffic also does the housekeeping, at most every 30 s per instance.
let last = 0;
export function housekeep() {
  if (Date.now() - last < 30_000) return;
  last = Date.now();
  void getDb()
    .then(async (db) => {
      await expireHolds(db);
      await runDueJobs(db, 5);
    })
    .catch((e) => console.error("housekeeping failed", e));
}
