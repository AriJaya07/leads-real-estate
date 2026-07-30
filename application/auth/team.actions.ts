"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient, ActionError } from "@/application/safe-action";
import { canAssignRole } from "@/domain/auth/permissions";
import { generateTemporaryPassword, hashPassword } from "@/infrastructure/auth/password";
import { bumpSessionVersion } from "./session-version";

/**
 * Operations on *existing* accounts within the caller's company — role
 * changes, password resets, removal. Creating a new account is
 * `invite.actions.ts` (email invite, no direct-create path — see that file
 * for why). Every operation here is scoped to `ctx.user.companyId` — a
 * `userId` belonging to a different company must resolve as "not found,"
 * never silently succeed.
 */

const roleSchema = z.enum(["owner", "admin", "manager", "member"]);

async function ownerCount(companyId: string): Promise<number> {
  const [{ owners }] = await db()
    .select({ owners: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(and(eq(schema.users.role, "owner"), eq(schema.users.companyId, companyId)));
  return owners;
}

async function findMember(userId: string, companyId: string) {
  const [row] = await db()
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

export const resetTeamMemberPassword = adminActionClient
  .inputSchema(z.object({ userId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const target = await findMember(parsedInput.userId, ctx.user.companyId);
    if (!target) throw new ActionError("User not found.");
    if (target.role === "owner" && ctx.user.role !== "owner") {
      throw new ActionError("Only an owner can reset another owner's password.");
    }

    const temporaryPassword = generateTemporaryPassword();

    const [updated] = await db()
      .update(schema.users)
      .set({
        passwordHash: await hashPassword(temporaryPassword),
        passwordSetAt: new Date(),
        mustChangePassword: true,
      })
      .where(and(eq(schema.users.id, parsedInput.userId), eq(schema.users.companyId, ctx.user.companyId)))
      .returning({ email: schema.users.email });

    if (!updated) throw new ActionError("User not found.");

    // Whatever session that account was using — on whatever device — is dead
    // the moment an admin decides its credential needs resetting.
    await bumpSessionVersion(parsedInput.userId);

    return { email: updated.email, temporaryPassword };
  });

export const setTeamMemberRole = adminActionClient
  .inputSchema(z.object({ userId: z.string().uuid(), role: roleSchema }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.userId === ctx.user.userId) {
      throw new ActionError("You cannot change your own role.");
    }

    if (!canAssignRole(ctx.user.role, parsedInput.role)) {
      throw new ActionError("Only an owner can grant the owner role.");
    }

    const target = await findMember(parsedInput.userId, ctx.user.companyId);
    if (!target) throw new ActionError("User not found.");

    if (target.role === "owner" && ctx.user.role !== "owner") {
      throw new ActionError("Only an owner can change another owner's role.");
    }

    if (target.role === "owner" && parsedInput.role !== "owner" && (await ownerCount(ctx.user.companyId)) <= 1) {
      throw new ActionError("At least one owner must remain.");
    }

    const [updated] = await db()
      .update(schema.users)
      .set({ role: parsedInput.role })
      .where(and(eq(schema.users.id, parsedInput.userId), eq(schema.users.companyId, ctx.user.companyId)))
      .returning({ id: schema.users.id });

    if (!updated) throw new ActionError("User not found.");
    return { ok: true };
  });

export const removeTeamMember = adminActionClient
  .inputSchema(z.object({ userId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.userId === ctx.user.userId) {
      throw new ActionError("You cannot remove your own account.");
    }

    const target = await findMember(parsedInput.userId, ctx.user.companyId);
    if (!target) throw new ActionError("User not found.");

    if (target.role === "owner") {
      if (ctx.user.role !== "owner") throw new ActionError("Only an owner can remove an owner.");
      if ((await ownerCount(ctx.user.companyId)) <= 1) {
        throw new ActionError("At least one owner must remain.");
      }
    }

    // Lead assignments and audit events null out rather than cascade — the
    // history of who did what stays intact.
    const [deleted] = await db()
      .delete(schema.users)
      .where(and(eq(schema.users.id, parsedInput.userId), eq(schema.users.companyId, ctx.user.companyId)))
      .returning({ id: schema.users.id });

    if (!deleted) throw new ActionError("User not found.");
    return { ok: true };
  });

export async function listTeamMembers(companyId: string) {
  return db()
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      mustChangePassword: schema.users.mustChangePassword,
      lastSeenAt: schema.users.lastSeenAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.companyId, companyId))
    .orderBy(schema.users.createdAt);
}

/**
 * Narrower than `listTeamMembers()`: name/email only, no `mustChangePassword`/
 * `lastSeenAt`/`role`. `/admin/team` is admin-only and needs the full record;
 * the pipeline board's assignee picker is agent-accessible and only needs
 * enough to label a dropdown option, not a teammate's account-security state.
 */
export async function listAssignableTeamMembers(companyId: string) {
  return db()
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.companyId, companyId))
    .orderBy(schema.users.name, schema.users.email);
}
