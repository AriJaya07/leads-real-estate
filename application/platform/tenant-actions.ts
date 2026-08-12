"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { platformActionClient, ActionError } from "@/application/safe-action";
import { generateToken, hashToken } from "@/infrastructure/auth/tokens";
import { getNotifier } from "@/infrastructure/notifiers/registry";
import { serverEnv } from "@/shared/config/env";

/**
 * The two writes a Super Admin is allowed to make against a tenant — see
 * `docs/multi-tenant-apify-isolation-plan.md` §3 and
 * `infrastructure/db/schema/platform.ts`'s `superAdminActions` comment.
 * Deliberately not a general-purpose "edit this tenant" action: adding a
 * third capability here means adding a third `superAdminActionEnum` value
 * and a third function, not loosening what either of these already does.
 */

const MAX_EXTEND_DAYS = 30;
const INVITE_TTL_HOURS = 72;

async function logAction(
  companyId: string,
  platformAdminUserId: string,
  action: "extend_trial" | "resend_invite",
  details: Record<string, unknown>,
): Promise<void> {
  await db().insert(schema.superAdminActions).values({ companyId, platformAdminUserId, action, details });
}

export const extendTenantTrial = platformActionClient
  .inputSchema(z.object({ companyId: z.string().uuid(), days: z.coerce.number().int().min(1).max(MAX_EXTEND_DAYS) }))
  .action(async ({ parsedInput, ctx }) => {
    const [company] = await db()
      .select({ id: schema.companies.id, trialEndsAt: schema.companies.trialEndsAt, status: schema.companies.status })
      .from(schema.companies)
      .where(eq(schema.companies.id, parsedInput.companyId))
      .limit(1);
    if (!company) throw new ActionError("Tenant not found.");
    if (company.status !== "trialing") throw new ActionError("Only a trialing tenant's trial can be extended.");

    const base = company.trialEndsAt && company.trialEndsAt > new Date() ? company.trialEndsAt : new Date();
    const newTrialEndsAt = new Date(base.getTime() + parsedInput.days * 24 * 60 * 60 * 1000);

    await db()
      .update(schema.companies)
      .set({ trialEndsAt: newTrialEndsAt })
      .where(eq(schema.companies.id, parsedInput.companyId));

    await logAction(parsedInput.companyId, ctx.user.userId, "extend_trial", { days: parsedInput.days, newTrialEndsAt });

    return { ok: true, newTrialEndsAt };
  });

export const resendTenantInvite = platformActionClient
  .inputSchema(z.object({ inviteId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [invite] = await db()
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.id, parsedInput.inviteId))
      .limit(1);
    if (!invite || invite.acceptedAt || invite.revokedAt) throw new ActionError("Invite not found or no longer pending.");

    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
    await db()
      .update(schema.invites)
      .set({ tokenHash: hashToken(token), expiresAt })
      .where(eq(schema.invites.id, invite.id));

    const url = `${serverEnv().APP_URL}/invite/${token}`;
    const { ok: emailSent } = await getNotifier("email").send({
      to: invite.email,
      subject: "You're invited to join a team on AveronAi",
      text: `You've been invited to join a team on AveronAi Lead Radar.\n\nAccept your invite: ${url}\n\nThis link expires in ${INVITE_TTL_HOURS} hours.`,
      html: `<p>You've been invited to join a team on AveronAi Lead Radar.</p><p><a href="${url}">Accept your invite</a></p><p>This link expires in ${INVITE_TTL_HOURS} hours.</p>`,
    });

    await logAction(invite.companyId, ctx.user.userId, "resend_invite", { inviteId: invite.id, email: invite.email, emailSent });

    return { ok: true, email: invite.email, emailSent };
  });
