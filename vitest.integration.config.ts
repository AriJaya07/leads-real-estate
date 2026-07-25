import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Separate from vitest.config.ts on purpose: these tests hit a real (disposable)
 * Postgres database and must never run as part of the fast unit suite that fires
 * on every save. See docs/testing-strategy.md and test/integration/db-helpers.ts.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["./test/integration-setup.ts"],
    // Integration tests share one real database; parallel files would race on
    // resetDb() truncating tables out from under each other.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
