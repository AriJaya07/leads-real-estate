/**
 * Loads `.env.test` for local integration-test runs. In CI, the workflow sets
 * these env vars directly and no `.env.test` file exists — `loadEnvFile` throwing
 * ENOENT there is expected and safe to ignore rather than fail the run on.
 */
try {
  process.loadEnvFile(".env.test");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set for integration tests. Copy .env.test.example to .env.test " +
      "and point it at a disposable test database, or set the env vars directly in CI.",
  );
}
