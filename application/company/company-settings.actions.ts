"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { ActionError, adminActionClient, ownerActionClient } from "@/application/safe-action";
import { clearSessionCookie } from "@/infrastructure/auth/session";

export async function getCompany(companyId: string) {
  const [row] = await db()
    .select({ id: schema.companies.id, name: schema.companies.name })
    .from(schema.companies)
    .where(eq(schema.companies.id, companyId))
    .limit(1);
  return row ?? null;
}

/** Admin+ — same tier as the rest of `/admin` settings surfaces. */
export const updateCompanyName = adminActionClient
  .inputSchema(z.object({ name: z.string().trim().min(1).max(200) }))
  .action(async ({ parsedInput, ctx }) => {
    await db()
      .update(schema.companies)
      .set({ name: parsedInput.name, updatedAt: new Date() })
      .where(eq(schema.companies.id, ctx.user.companyId));
    return { ok: true };
  });

/**
 * The one place in AveronAi where data is actually destroyed — every other
 * downgrade/cancel path degrades access without deleting anything (see
 * `docs/saas-platform-architecture.md`). Owner-only, and the cascading FKs on
 * `companies.id` (see `infrastructure/db/schema`) take every child row —
 * leads, datasets, alert rules, users — with it.
 */
export const deleteCompany = ownerActionClient
  .inputSchema(z.object({ confirmName: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const company = await getCompany(ctx.user.companyId);
    if (!company || company.name !== parsedInput.confirmName) {
      throw new ActionError("Company name doesn't match.");
    }
    await db().delete(schema.companies).where(eq(schema.companies.id, ctx.user.companyId));
    await clearSessionCookie();
    return { ok: true };
  });
