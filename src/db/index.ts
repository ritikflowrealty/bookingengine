import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { seed } from "./seed";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Demo mode: no DATABASE_URL → an in-process Postgres (PGlite) seeded with sample projects. Data resets on cold start. */
export const DEMO = !process.env.DATABASE_URL;

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function connect(): Promise<DB> {
  if (!DEMO) {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    neonConfig.webSocketConstructor = (await import("ws")).default;
    // Pool (WebSocket) driver: supports interactive transactions, needed for SELECT … FOR UPDATE.
    return drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), { schema }) as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  await seed(db as unknown as DB, { demo: true });
  return db as unknown as DB;
}

const g = globalThis as unknown as { __flowDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  g.__flowDb ??= connect().catch((e) => {
    g.__flowDb = undefined;
    throw e;
  });
  return g.__flowDb;
}

export { schema };
