"use server";

import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { actionClient, ActionError } from "@/application/safe-action";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/infrastructure/auth/password";
import { generateToken, hashToken } from "@/infrastructure/auth/tokens";
import { getNotifier } from "@/infrastructure/notifiers/registry";
import { serverEnv } from "@/shared/config/env";
import { bumpSessionVersion } from "./session-version";

/**
 * Self-service "forgot password," distinct from the admin-issued temporary
 * password in `team.actions.ts::resetTeamMemberPassword` — that one requires
 * an admin; this one lets a locked-out user recover on their own via the
 * email on file.
 */

const RESET_TTL_MINUTES = 60;
/** Throttles reset-email spam against one account — independent of login's own lockout. */
const RESET_REQUEST_WINDOW_MINUTES = 15;
const RESET_REQUEST_MAX = 3;

/**
 * Reuses `password_reset_tokens` itself as the throttle log — every request
 * already inserts a row here, so counting recent ones needs no new table.
 * Exported (and kept as a plain function, not inlined into the action) for
 * the same reason `application/auth/login-attempts.ts` is split out: testable
 * directly, without a request-scoped Next.js context.
 */
export async function countRecentResetRequests(userId: string): Promise<number> {
  const since = new Date(Date.now() - RESET_REQUEST_WINDOW_MINUTES * 60_000);
  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.passwordResetTokens)
    .where(and(eq(schema.passwordResetTokens.userId, userId), gte(schema.passwordResetTokens.createdAt, since)));
  return count;
}

const requestSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
});

/**
 * Always returns the same generic result whether or not the address has an
 * account, or whether it was throttled — an attacker probing emails, or
 * watching for a response difference, must not be able to tell either case
 * apart. Public: the requester has no session yet.
 */
export const requestPasswordReset = actionClient.inputSchema(requestSchema).action(async ({ parsedInput }) => {
  const [user] = await db()
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, parsedInput.email))
    .limit(1);

  if (user) {
    // Without this, `requestPasswordReset` had zero throttling (unlike
    // `signIn`), letting an attacker script unlimited reset emails at a
    // victim's inbox.
    if ((await countRecentResetRequests(user.id)) < RESET_REQUEST_MAX) {
      const token = generateToken();
      await db().insert(schema.passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      });

      const url = `${serverEnv().APP_URL}/reset-password/${token}`;
      await getNotifier("email").send({
        to: user.email,
        subject: "Reset your AveronAi password",
        text: `Reset your password: ${url}\n\nThis link expires in ${RESET_TTL_MINUTES} minutes. If you didn't request this, ignore this email.`,
        html: `<p><a href="${url}">Reset your password</a></p><p>This link expires in ${RESET_TTL_MINUTES} minutes. If you didn't request this, ignore this email.</p>`,
      });
    }
    // At/over the throttle: silently skip creating a token or sending an email,
    // but still fall through to the same generic response below.
  }

  return {
    ok: true,
    message: "If that email has an account, we've sent a link to reset the password.",
  };
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
});

/** Public — the requester has no session yet. */
export const resetPassword = actionClient.inputSchema(resetSchema).action(async ({ parsedInput }) => {
  const tokenHash = hashToken(parsedInput.token);
  const now = new Date();

  const [row] = await db()
    .select({ id: schema.passwordResetTokens.id, userId: schema.passwordResetTokens.userId })
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, tokenHash),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) throw new ActionError("This reset link is invalid or has expired.");

  await db().transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({
        passwordHash: await hashPassword(parsedInput.password),
        passwordSetAt: new Date(),
        mustChangePassword: false,
      })
      .where(eq(schema.users.id, row.userId));

    await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.passwordResetTokens.id, row.id));
  });

  // Any session already open on this account — a shared/compromised device —
  // is dead the moment the password is reset this way.
  await bumpSessionVersion(row.userId);

  return { ok: true };
});

/** For the /reset-password/[token] page to tell an expired/used link apart from a fresh one. */
export async function isPasswordResetTokenValid(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const [row] = await db()
    .select({ id: schema.passwordResetTokens.id })
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, tokenHash),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}
