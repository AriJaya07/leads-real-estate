"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient } from "@/application/safe-action";
import { ActionError } from "@/application/safe-action";
import { generateTemporaryPassword, hashPassword } from "@/infrastructure/auth/password";

/**
 * Account management without an email provider. An admin creates the account and
 * hands over the generated temporary password out of band; the user must change
 * it on first sign-in.
 */

const emailSchema = z
  .string()
  .email()
  .transform((value) => value.trim().toLowerCase());

export const createTeamMember = adminActionClient
  .inputSchema(
    z.object({
      email: emailSchema,
      name: z.string().trim().max(120).optional(),
      role: z.enum(["admin", "agent"]).default("agent"),
    }),
  )
  .action(async ({ parsedInput }) => {
    const temporaryPassword = generateTemporaryPassword();

    const [created] = await db()
      .insert(schema.users)
      .values({
        email: parsedInput.email,
        name: parsedInput.name || null,
        role: parsedInput.role,
        passwordHash: await hashPassword(temporaryPassword),
        passwordSetAt: new Date(),
        mustChangePassword: true,
      })
      .onConflictDoNothing({ target: schema.users.email })
      .returning({ id: schema.users.id, email: schema.users.email });

    if (!created) throw new ActionError("That email already has an account.");

    // Returned once, never stored in readable form — the hash is all that persists.
    return { email: created.email, temporaryPassword };
  });

export const resetTeamMemberPassword = adminActionClient
  .inputSchema(z.object({ userId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const temporaryPassword = generateTemporaryPassword();

    const [updated] = await db()
      .update(schema.users)
      .set({
        passwordHash: await hashPassword(temporaryPassword),
        passwordSetAt: new Date(),
        mustChangePassword: true,
      })
      .where(eq(schema.users.id, parsedInput.userId))
      .returning({ email: schema.users.email });

    if (!updated) throw new ActionError("User not found.");
    return { email: updated.email, temporaryPassword };
  });

export const setTeamMemberRole = adminActionClient
  .inputSchema(z.object({ userId: z.string().uuid(), role: z.enum(["admin", "agent"]) }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.userId === ctx.user.userId && parsedInput.role !== "admin") {
      throw new ActionError("You cannot remove your own admin access.");
    }

    if (parsedInput.role === "agent") {
      const [{ admins }] = await db()
        .select({ admins: sql<number>`count(*)::int` })
        .from(schema.users)
        .where(eq(schema.users.role, "admin"));
      // Losing the last admin would lock everyone out of dataset management.
      if (admins <= 1) throw new ActionError("At least one admin must remain.");
    }

    await db()
      .update(schema.users)
      .set({ role: parsedInput.role })
      .where(eq(schema.users.id, parsedInput.userId));

    return { ok: true };
  });

export const removeTeamMember = adminActionClient
  .inputSchema(z.object({ userId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.userId === ctx.user.userId) {
      throw new ActionError("You cannot remove your own account.");
    }

    // Lead assignments and audit events null out rather than cascade — the
    // history of who did what stays intact.
    await db().delete(schema.users).where(eq(schema.users.id, parsedInput.userId));
    return { ok: true };
  });

export async function listTeamMembers() {
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
    .orderBy(schema.users.createdAt);
}
