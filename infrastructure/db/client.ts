import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/shared/config/env";
import * as schema from "./schema";

/**
 * One pooled client per process. Kept on `globalThis` so Next's dev HMR does not
 * open a new pool on every reload and exhaust Postgres connections.
 */
const globalForDb = globalThis as unknown as {
  __averonaiSql?: ReturnType<typeof postgres>;
};

function getSql() {
  if (!globalForDb.__averonaiSql) {
    globalForDb.__averonaiSql = postgres(serverEnv().DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      prepare: false,
    });
  }
  return globalForDb.__averonaiSql;
}

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: Database | null = null;

export function db(): Database {
  if (!cachedDb) cachedDb = drizzle(getSql(), { schema });
  return cachedDb;
}

export { schema };
