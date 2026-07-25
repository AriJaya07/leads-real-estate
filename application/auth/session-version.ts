import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

/**
 * Split out for the same reason `login-attempts.ts` is: plain database I/O,
 * testable without a request-scoped Next.js context. See
 * `domain/auth/session-version.ts` for the revocation decision itself.
 */

/** Increments and returns the new version — every existing session for this user is now stale. */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const [row] = await db()
    .update(schema.users)
    .set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, userId))
    .returning({ sessionVersion: schema.users.sessionVersion });
  return row.sessionVersion;
}
