"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { actionClient, adminActionClient, ActionError } from "@/application/safe-action";
import { assertWithinLimit, LimitExceededError } from "@/application/billing/usage";
import { canAssignRole } from "@/domain/auth/permissions";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/infrastructure/auth/password";
import { generateToken, hashToken } from "@/infrastructure/auth/tokens";
import { getNotifier } from "@/infrastructure/notifiers/registry";
import { serverEnv } from "@/shared/config/env";
import { startSession } from "./login.actions";

/**
 * Email-based team invites. Unlike the old direct-create path (an admin
 * generates the account and a temporary password up front), an invite is
 * *pending* until the recipient sets their own password — the account row
 * doesn't exist until `acceptInvite` runs. Degrades the same way
 * `infrastructure/notifiers/email.notifier.ts` always has: without
 * `RESEND_API_KEY` configured, the link is returned to the admin to hand over
 * manually instead of emailed, never a hard failure.
 */

const INVITE_TTL_HOURS = 72;

const emailSchema = z
  .string()
  .email()
  .transform((value) => value.trim().toLowerCase());

const roleSchema = z.enum(["owner", "admin", "manager", "member"]);

function inviteUrl(token: string): string {
  return `${serverEnv().APP_URL}/invite/${token}`;
}

export const inviteTeamMember = adminActionClient
  .inputSchema(z.object({ email: emailSchema, role: roleSchema.default("member") }))
  .action(async ({ parsedInput, ctx }) => {
    if (!canAssignRole(ctx.user.role, parsedInput.role)) {
      throw new ActionError("Only an owner can invite another owner.");
    }

    try {
      await assertWithinLimit(ctx.user.companyId, "seats");
    } catch (error) {
      if (error instanceof LimitExceededError) throw new ActionError(error.message);
      throw error;
    }

    const [existingUser] = await db()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, parsedInput.email))
      .limit(1);
    if (existingUser) throw new ActionError("That email already has an account.");

    // Re-inviting the same address supersedes any invite still outstanding —
    // only the newest link should ever be valid.
    await db()
      .update(schema.invites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.invites.companyId, ctx.user.companyId),
          eq(schema.invites.email, parsedInput.email),
          isNull(schema.invites.acceptedAt),
          isNull(schema.invites.revokedAt),
        ),
      );

    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    await db().insert(schema.invites).values({
      companyId: ctx.user.companyId,
      email: parsedInput.email,
      role: parsedInput.role,
      tokenHash: hashToken(token),
      invitedByUserId: ctx.user.userId,
      expiresAt,
    });

    const url = inviteUrl(token);
    const { ok: emailSent } = await getNotifier("email").send({
      to: parsedInput.email,
      subject: "You're invited to join a team on AveronAi",
      text: `You've been invited to join a team on AveronAi Lead Radar.\n\nAccept your invite: ${url}\n\nThis link expires in ${INVITE_TTL_HOURS} hours.`,
      html: `<p>You've been invited to join a team on AveronAi Lead Radar.</p><p><a href="${url}">Accept your invite</a></p><p>This link expires in ${INVITE_TTL_HOURS} hours.</p>`,
    });

    return { email: parsedInput.email, inviteUrl: url, emailSent };
  });

export const revokeInvite = adminActionClient
  .inputSchema(z.object({ inviteId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [revoked] = await db()
      .update(schema.invites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.invites.id, parsedInput.inviteId),
          eq(schema.invites.companyId, ctx.user.companyId),
          isNull(schema.invites.acceptedAt),
        ),
      )
      .returning({ id: schema.invites.id });

    if (!revoked) throw new ActionError("Invite not found.");
    return { ok: true };
  });

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().max(120).optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
});

/** Public — the recipient has no session yet. */
export const acceptInvite = actionClient.inputSchema(acceptInviteSchema).action(async ({ parsedInput }) => {
  const tokenHash = hashToken(parsedInput.token);

  const [invite] = await db()
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, tokenHash))
    .limit(1);

  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) {
    throw new ActionError("This invite link is invalid or has expired.");
  }

  const created = await db().transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, invite.email))
      .limit(1);
    if (existing) throw new ActionError("That email already has an account.");

    // Re-checked here, not just at invite time — seats can fill up (or the
    // plan can shrink) in the window between an invite being sent and
    // accepted.
    const [plan] = await tx
      .select({ maxSeats: schema.plans.maxSeats })
      .from(schema.subscriptions)
      .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
      .where(eq(schema.subscriptions.companyId, invite.companyId))
      .limit(1);
    if (plan && plan.maxSeats !== null) {
      const [seatCount] = await tx
        .select({ value: count() })
        .from(schema.users)
        .where(eq(schema.users.companyId, invite.companyId));
      if (seatCount.value >= plan.maxSeats) {
        throw new ActionError("This company's seat limit has been reached. Ask an admin to free a seat.");
      }
    }

    const [user] = await tx
      .insert(schema.users)
      .values({
        companyId: invite.companyId,
        email: invite.email,
        name: parsedInput.name || null,
        role: invite.role,
        passwordHash: await hashPassword(parsedInput.password),
        passwordSetAt: new Date(),
      })
      .returning();

    await tx.update(schema.invites).set({ acceptedAt: new Date() }).where(eq(schema.invites.id, invite.id));

    return user;
  });

  await startSession({
    id: created.id,
    email: created.email,
    role: created.role,
    sessionVersion: created.sessionVersion,
    companyId: created.companyId,
  });

  return { ok: true };
});

/**
 * For the /invite/[token] page to render "{inviter} invited you to join
 * {company}" plus the real expiry, before the recipient sets a password.
 * Joins to the inviting user for their display name (falling back to their
 * email — `users.name` is optional, set from the account's own profile, and
 * an invite must render something even when the inviter never set one).
 */
export async function getInviteByToken(token: string) {
  const tokenHash = hashToken(token);
  const [invite] = await db()
    .select({
      email: schema.invites.email,
      role: schema.invites.role,
      acceptedAt: schema.invites.acceptedAt,
      revokedAt: schema.invites.revokedAt,
      expiresAt: schema.invites.expiresAt,
      companyName: schema.companies.name,
      invitedByName: schema.users.name,
      invitedByEmail: schema.users.email,
    })
    .from(schema.invites)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.invites.companyId))
    .innerJoin(schema.users, eq(schema.users.id, schema.invites.invitedByUserId))
    .where(eq(schema.invites.tokenHash, tokenHash))
    .limit(1);

  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) return null;
  return {
    email: invite.email,
    role: invite.role,
    companyName: invite.companyName,
    invitedBy: invite.invitedByName?.trim() || invite.invitedByEmail,
    expiresAt: invite.expiresAt,
  };
}

export async function listPendingInvites(companyId: string) {
  const rows = await db()
    .select({
      id: schema.invites.id,
      email: schema.invites.email,
      role: schema.invites.role,
      expiresAt: schema.invites.expiresAt,
      createdAt: schema.invites.createdAt,
    })
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.companyId, companyId),
        isNull(schema.invites.acceptedAt),
        isNull(schema.invites.revokedAt),
      ),
    )
    .orderBy(schema.invites.createdAt);

  const now = new Date();
  return rows.map((row) => ({ ...row, expired: row.expiresAt < now }));
}
