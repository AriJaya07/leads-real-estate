/**
 * Migration runner. Creates the extensions Drizzle cannot declare in schema
 * (pg_trgm backs both lead search and near-duplicate detection), then applies
 * the generated SQL migrations.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  await migrate(drizzle(sql), { migrationsFolder: "./infrastructure/db/migrations" });
  console.log("migrations applied");
} catch (error) {
  console.error("migration failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
