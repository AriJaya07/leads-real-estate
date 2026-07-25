import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // Integration tests hit a real database and have their own config
    // (vitest.integration.config.ts) — they must not also run as part of the
    // fast unit suite, which has no DB connection configured.
    exclude: ["node_modules/**", ".next/**", "**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` throws on import outside a React Server Component. Under
      // Vitest there is no RSC boundary, so it is stubbed out.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
