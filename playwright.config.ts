import { defineConfig, devices } from "@playwright/test";

// Local runs load .env.e2e directly (mirrors test/integration-setup.ts); CI sets
// the same variables in the workflow env block, so a missing file there is fine.
try {
  process.loadEnvFile(".env.e2e");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Mirrors the CI job: build once, then start the production server — this
    // suite is meant to catch real regressions, not dev-mode-only behavior.
    // Run `npm run build` first when iterating locally (CI does this as a
    // separate step ahead of `npm run test:e2e`).
    command: `npm run start -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: process.env as Record<string, string>,
  },
});
