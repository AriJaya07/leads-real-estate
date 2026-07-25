import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { LOGIN_ATTEMPT_WINDOW_MINUTES } from "@/shared/constants";

/**
 * Split out of `login.actions.ts` specifically so it's testable without a
 * request-scoped Next.js context — `signIn` itself calls `cookies()` via
 * `setSessionCookie`, which only works inside a real request, but counting and
 * recording attempts is plain database I/O and can be integration-tested
 * directly (see login-attempts.integration.test.ts).
 */

export async function countRecentFailedAttempts(email: string): Promise<number> {
  const since = new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MINUTES * 60_000);
  const [{ count }] = await db()
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

export async function recordLoginAttempt(email: string, succeeded: boolean): Promise<void> {
  await db().insert(schema.loginAttempts).values({ email, succeeded });
}
