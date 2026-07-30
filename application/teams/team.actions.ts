"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient, ActionError } from "@/application/safe-action";

/**
 * Sub-groups within a company — distinct from `application/auth/team.actions.ts`,
 * which already owns "team" for company-wide user management. See
 * docs/saas-database-schema.md.
 */

async function assertOwnsTeam(companyId: string, teamId: string) {
  const [team] = await db()
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(and(eq(schema.teams.id, teamId), eq(schema.teams.companyId, companyId)))
    .limit(1);
  if (!team) throw new ActionError("Team not found.");
}

export const createTeam = adminActionClient
  .inputSchema(z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional() }))
  .action(async ({ parsedInput, ctx }) => {
    const [created] = await db()
      .insert(schema.teams)
      .values({ companyId: ctx.user.companyId, name: parsedInput.name, description: parsedInput.description || null })
      .onConflictDoNothing({ target: [schema.teams.companyId, schema.teams.name] })
      .returning({ id: schema.teams.id });

    if (!created) throw new ActionError("A team with that name already exists.");
    return { ok: true };
  });

export const deleteTeam = adminActionClient
  .inputSchema(z.object({ teamId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsTeam(ctx.user.companyId, parsedInput.teamId);
    await db().delete(schema.teams).where(eq(schema.teams.id, parsedInput.teamId));
    return { ok: true };
  });

export const addTeamMember = adminActionClient
  .inputSchema(z.object({ teamId: z.string().uuid(), userId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsTeam(ctx.user.companyId, parsedInput.teamId);

    const [member] = await db()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, parsedInput.userId), eq(schema.users.companyId, ctx.user.companyId)))
      .limit(1);
    if (!member) throw new ActionError("Teammate not found.");

    await db()
      .insert(schema.teamMembers)
      .values({ teamId: parsedInput.teamId, userId: parsedInput.userId })
      .onConflictDoNothing();

    return { ok: true };
  });

export const removeTeamMember = adminActionClient
  .inputSchema(z.object({ teamId: z.string().uuid(), userId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsTeam(ctx.user.companyId, parsedInput.teamId);

    await db()
      .delete(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, parsedInput.teamId), eq(schema.teamMembers.userId, parsedInput.userId)));

    return { ok: true };
  });
