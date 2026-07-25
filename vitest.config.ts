import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
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
