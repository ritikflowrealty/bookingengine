import { getDb } from "@/db";
import { expireHolds } from "@/lib/inventory/service";
import { runDueJobs } from "@/lib/integrations/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const [released, jobs] = [await expireHolds(db), await runDueJobs(db)];
  return Response.json({ released, jobs });
}
