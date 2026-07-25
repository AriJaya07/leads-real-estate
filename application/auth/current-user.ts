import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getSession } from "@/infrastructure/auth/session";
import { isSessionRevoked } from "@/domain/auth/session-version";

export interface CurrentUser {
  userId: string;
  email: string;
  role: "admin" | "agent";
  /** True while a temporary (admin-issued or bootstrap) password hasn't been changed yet. */
  mustChangePassword: boolean;
}

/**
 * Authoritative auth check. `proxy.ts` only does the cheap optimistic redirect;
 * every server action and page that touches data re-verifies here, because
 * proxy-level checks are not a security boundary.
 *
 * Two things are re-verified against the database on every call, never trusted
 * from the signed cookie alone: `role` (so a role change takes effect
 * immediately, not after the token expires) and `sessionVersion` (so a
 * password change/reset or an explicit "sign out everywhere" actually revokes
 * the token — a JWT is otherwise stateless and stays valid until its own
 * expiry regardless of what happens to the account afterward).
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const [row] = await db()
    .select({
      id: schema.users.id,
      email: schema.users.email,
      role: schema.users.role,
      mustChangePassword: schema.users.mustChangePassword,
      sessionVersion: schema.users.sessionVersion,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  if (!row) return null;
  if (isSessionRevoked(session.sessionVersion, row.sessionVersion)) return null;

  return {
    userId: row.id,
    email: row.email,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
  };
});

/**
 * Full auth gate: signed in, and not blocked on a pending forced password
 * change. Deliberately not enforced in a shared layout — layouts don't re-run
 * on client-side navigation between sibling pages, so a check placed there
 * only fires reliably on the very first hard load. This function is called
 * directly by every protected page's own Server Component render (which does
 * re-run on every navigation), matching Next's own guidance to check "close to
 * the data source," not the shared shell. `/account` itself calls
 * `currentUser()` directly to avoid a redirect loop.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/leads");
  return user;
}
