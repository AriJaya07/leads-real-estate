import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./infrastructure/db/schema/index.ts",
  out: "./infrastructure/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
