"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
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
import type { Role } from "@/domain/auth/permissions";
import { LOGIN_MAX_FAILED_ATTEMPTS } from "@/shared/constants";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1, "Enter your password"),
});

/**
 * Deliberately identical for "no such user" and "wrong password", and the
 * attempts-remaining count appended below is derived purely from the
 * per-email failure log (`countRecentFailedAttempts`) — computed the same way
 * regardless of whether the account exists, so it can't be used to tell the
 * two cases apart either.
 */
function invalidCredentialsMessage(attemptsRemaining: number): string {
  const detail =
    attemptsRemaining > 0
      ? `${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} left before a cooldown.`
      : "This was your last attempt before a cooldown.";
  return `That email and password don't match. ${detail}`;
}

/** Exported for `signup.actions.ts::signUp` — same "issue a real session" step, new account or not. */
export async function startSession(user: {
  id: string;
  email: string;
  role: Role;
  sessionVersion: number;
  companyId: string;
}) {
  await db().update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, user.id));
  const token = await signSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionVersion: user.sessionVersion,
    companyId: user.companyId,
  });
  await setSessionCookie(token);
}

/**
 * Email + password sign-in. A fresh instance has no "claim the instance"
 * bootstrap anymore — every account belongs to a company created via
 * `signup.actions.ts::signUp`; accounts for an existing company are created by
 * an admin from /admin/team.
 */
export const signIn = actionClient.inputSchema(credentialsSchema).action(async ({ parsedInput }) => {
  const { email, password } = parsedInput;

  // The whole check-verify-record sequence runs inside one transaction,
  // serialized per email via a Postgres advisory lock held for the
  // transaction's lifetime (`pg_advisory_xact_lock`, released automatically
  // on commit/rollback). Holding it only around the *count check* isn't
  // enough — the race is that concurrent requests each read "under the
  // limit" before any of them has recorded its own failure, and password
  // verification (the slow step) sits between those two things. Serializing
  // the whole sequence per email is what actually closes it: a second
  // concurrent `signIn` for the same email blocks until the first's attempt
  // (success or failure) has been recorded. Different emails hash to
  // different lock keys and never block each other, and outcomes are
  // returned rather than thrown from inside the callback, since throwing
  // would roll back the failed-attempt row this is trying to persist.
  const outcome = await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

    const priorFailures = await countRecentFailedAttempts(email, tx);
    if (isLoginRateLimited(priorFailures)) {
      return { status: "rate_limited" as const };
    }
    // This request's own failure (if any) counts toward the total, hence -1.
    const attemptsRemaining = LOGIN_MAX_FAILED_ATTEMPTS - priorFailures - 1;

    const [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

    if (!user?.passwordHash) {
      // Same cost as a real check, so a missing account is indistinguishable.
      await fakeVerify();
      await recordLoginAttempt(email, false, tx);
      return { status: "invalid" as const, attemptsRemaining };
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      await recordLoginAttempt(email, false, tx);
      return { status: "invalid" as const, attemptsRemaining };
    }

    await recordLoginAttempt(email, true, tx);
    return { status: "ok" as const, user };
  });

  // Checked ahead of the credential lookup, and with the same fake-timing cost
  // as a real check on the way out — a rate-limited response must not be
  // distinguishable-by-latency from a normal wrong-password response, for the
  // same reason `fakeVerify()` exists at all.
  if (outcome.status === "rate_limited") {
    await fakeVerify();
    throw new ActionError("Too many failed attempts. Try again in a few minutes.");
  }
  if (outcome.status === "invalid") {
    throw new ActionError(invalidCredentialsMessage(outcome.attemptsRemaining));
  }

  await startSession(outcome.user);
  return { bootstrapped: false, mustChangePassword: outcome.user.mustChangePassword };
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
    await startSession({
      id: ctx.user.userId,
      email: ctx.user.email,
      role: ctx.user.role,
      sessionVersion,
      companyId: ctx.user.companyId,
    });

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
