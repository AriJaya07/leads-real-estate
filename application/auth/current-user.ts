import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getSession, type SessionPayload } from "@/infrastructure/auth/session";

/**
 * Authoritative auth check. `proxy.ts` only does the cheap optimistic redirect;
 * every server action and page that touches data re-verifies here, because
 * proxy-level checks are not a security boundary.
 */
export const currentUser = cache(async (): Promise<SessionPayload | null> => {
  const session = await getSession();
  if (!session) return null;

  const [row] = await db()
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  if (!row) return null;
  return { userId: row.id, email: row.email, role: row.role };
});

export async function requireUser(): Promise<SessionPayload> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/leads");
  return user;
}
