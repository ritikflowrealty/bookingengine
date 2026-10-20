import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// shortcut: neon-http has no interactive transactions; switch to the neon WebSocket Pool driver when
// hold/booking writes land (Phase 2) so SELECT … FOR UPDATE can run inside a transaction.
export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
export { schema };
