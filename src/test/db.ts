import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import type { DB } from "@/db";

/** Fresh migrated + demo-seeded in-memory Postgres for integration tests. */
export async function testDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seed(db as unknown as DB, { demo: true });
  return db as unknown as DB;
}
