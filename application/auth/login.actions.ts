"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { allowedEmails } from "@/shared/config/env";
import {
  MIN_PASSWORD_LENGTH,
  fakeVerify,
  hashPassword,
  verifyPassword,
} from "@/infrastructure/auth/password";
import { clearSessionCookie, setSessionCookie, signSession } from "@/infrastructure/auth/session";
import {
  ActionError,
  actionClient,
  authActionClientAllowPendingPasswordChange,
} from "@/application/safe-action";
import { countRecentFailedAttempts, recordLoginAttempt } from "./login-attempts";
import { bumpSessionVersion } from "./session-version";
import { isLoginRateLimited } from "@/domain/auth/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1, "Enter your password"),
});

/** Deliberately identical for "no such user" and "wrong password". */
const INVALID_CREDENTIALS = "Email or password is incorrect.";

async function startSession(user: {
  id: string;
  email: string;
  role: "admin" | "agent";
  sessionVersion: number;
}) {
  await db().update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, user.id));
  const token = await signSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionVersion: user.sessionVersion,
  });
  await setSessionCookie(token);
}

/**
 * Email + password sign-in.
 *
 * When the instance has no users yet, the first sign-in claims it as admin and
 * sets that password — so a fresh deployment needs no email provider, no seed
 * user and no CLI step. `AUTH_ALLOWED_EMAILS`, when set, restricts who may do
 * that; afterwards, accounts are created by an admin from /admin/team.
 */
export const signIn = actionClient.inputSchema(credentialsSchema).action(async ({ parsedInput }) => {
  const { email, password } = parsedInput;

  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users);

  if (count === 0) {
    const allowed = allowedEmails();
    if (allowed.length > 0 && !allowed.includes(email)) {
      throw new ActionError(
        "That address is not allowed to claim this instance. Check AUTH_ALLOWED_EMAILS.",
      );
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ActionError(
        `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters — this is the first admin account.`,
      );
    }

    const [created] = await db()
      .insert(schema.users)
      .values({
        email,
        role: "admin",
        passwordHash: await hashPassword(password),
        passwordSetAt: new Date(),
      })
      .returning();

    await startSession(created);
    return { bootstrapped: true, mustChangePassword: false };
  }

  // Checked ahead of the credential lookup, and with the same fake-timing cost
  // as a real check on the way out — a rate-limited response must not be
  // distinguishable-by-latency from a normal wrong-password response, for the
  // same reason `fakeVerify()` exists at all.
  if (isLoginRateLimited(await countRecentFailedAttempts(email))) {
    await fakeVerify();
    throw new ActionError("Too many failed attempts. Try again in a few minutes.");
  }

  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user?.passwordHash) {
    // Same cost as a real check, so a missing account is indistinguishable.
    await fakeVerify();
    await recordLoginAttempt(email, false);
    throw new ActionError(INVALID_CREDENTIALS);
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordLoginAttempt(email, false);
    throw new ActionError(INVALID_CREDENTIALS);
  }

  await recordLoginAttempt(email, true);
  await startSession(user);
  return { bootstrapped: false, mustChangePassword: user.mustChangePassword };
});

/**
 * Self-service change. Requires the current password even when signed in.
 *
 * Bumps `sessionVersion` so every *other* session for this account (a stolen
 * cookie, a forgotten logged-in device) is revoked on its next request — then
 * immediately re-issues a fresh session for the device that just proved it
 * knows the current password, so the person changing their own password isn't
 * logged out by their own action.
 */
export const changePassword = authActionClientAllowPendingPasswordChange
  .inputSchema(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z
        .string()
        .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const [user] = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, ctx.user.userId))
      .limit(1);

    if (!user?.passwordHash || !(await verifyPassword(parsedInput.currentPassword, user.passwordHash))) {
      throw new ActionError("Current password is incorrect.");
    }

    await db()
      .update(schema.users)
      .set({
        passwordHash: await hashPassword(parsedInput.newPassword),
        passwordSetAt: new Date(),
        mustChangePassword: false,
      })
      .where(eq(schema.users.id, ctx.user.userId));

    const sessionVersion = await bumpSessionVersion(ctx.user.userId);
    await startSession({ id: ctx.user.userId, email: ctx.user.email, role: ctx.user.role, sessionVersion });

    return { ok: true };
  });

/** Revokes every session for this account, including the one making the call. */
export const signOutEverywhere = authActionClientAllowPendingPasswordChange.action(async ({ ctx }) => {
  await bumpSessionVersion(ctx.user.userId);
  await clearSessionCookie();
  return { ok: true };
});

/**
 * Plain `actionClient`, not `authActionClient` — signing out must work even
 * from a stale/already-invalid session. Deliberately doesn't call `redirect()`
 * itself: a Server Action reference invoked directly from a client `onClick`
 * (as opposed to bound to a `<form action={...}>`) doesn't resolve an internal
 * `redirect()` the same way — the client is expected to navigate after the
 * promise resolves, same as `signOutEverywhere` above.
 */
export const signOut = actionClient.action(async () => {
  await clearSessionCookie();
  return { ok: true };
});
