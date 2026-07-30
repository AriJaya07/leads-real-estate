import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema, type Database } from "@/infrastructure/db/client";
import { LOGIN_ATTEMPT_WINDOW_MINUTES } from "@/shared/constants";

/**
 * Split out of `login.actions.ts` specifically so it's testable without a
 * request-scoped Next.js context — `signIn` itself calls `cookies()` via
 * `setSessionCookie`, which only works inside a real request, but counting and
 * recording attempts is plain database I/O and can be integration-tested
 * directly (see login-attempts.integration.test.ts).
 *
 * Both functions accept an optional query client (defaulting to `db()`) so
 * `signIn` can run them against a transaction — see that file's comment on
 * why the check and the eventual failure record need to share one.
 */
type QueryClient = Pick<Database, "select" | "insert">;

export async function countRecentFailedAttempts(email: string, client: QueryClient = db()): Promise<number> {
  const since = new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MINUTES * 60_000);
  const [{ count }] = await client
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.email, email),
        eq(schema.loginAttempts.succeeded, false),
        gte(schema.loginAttempts.createdAt, since),
      ),
    );
  return count;
}

export async function recordLoginAttempt(email: string, succeeded: boolean, client: QueryClient = db()): Promise<void> {
  await client.insert(schema.loginAttempts).values({ email, succeeded });
}
