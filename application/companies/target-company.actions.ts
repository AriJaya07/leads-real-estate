"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { authActionClient, ActionError } from "@/application/safe-action";
import { leadTag } from "@/application/cache-tags";

/**
 * Manual CRUD only — deliberately not wired into the ingestion pipeline.
 * `domain/dataset/types.ts`'s `MappingRules` has no employer/company field
 * concept, and adding one is a real feature (new canonical field, extraction
 * rules) out of proportion to what this pass builds. See
 * docs/saas-database-schema.md.
 */

async function assertOwnsLead(companyId: string, leadId: string) {
  const [lead] = await db()
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.companyId, companyId)))
    .limit(1);
  if (!lead) throw new ActionError("Lead not found.");
}

/**
 * Creates-or-finds the target company by name within the caller's company,
 * then links the given lead to it. One action, not two calls from the
 * client, so the combobox's "type a new name" and "pick an existing one"
 * paths both resolve to the same row without a race between create and link.
 */
export const linkLeadToCompany = authActionClient
  .inputSchema(
    z.object({
      leadId: z.string().uuid(),
      companyName: z.string().trim().min(1).max(200),
      role: z.enum(["owner", "agent", "employee", "unknown"]).default("unknown"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsLead(ctx.user.companyId, parsedInput.leadId);

    // No `onConflictDoNothing` here — this path never supplies a `domain`
    // (always NULL), and `target_companies`'s unique index on
    // `(company_id, domain)` is partial (`WHERE domain IS NOT NULL`), so a
    // conflict target naming that index would never match a NULL-domain row
    // — Postgres rejects an `ON CONFLICT` clause that can't be matched to a
    // real constraint (SQLSTATE 42P10) rather than silently ignoring it.
    // Name-only duplicates are an accepted tradeoff here, not a bug — see
    // `linkLeadToExistingCompany` below, which is what actually keeps
    // near-identical companies from accumulating in practice.
    const [target] = await db()
      .insert(schema.targetCompanies)
      .values({ companyId: ctx.user.companyId, name: parsedInput.companyName })
      .returning({ id: schema.targetCompanies.id });

    await db().insert(schema.leadTargetCompanyAffiliations).values({
      leadId: parsedInput.leadId,
      targetCompanyId: target.id,
      role: parsedInput.role,
      startedAt: new Date(),
    });

    updateTag(leadTag(parsedInput.leadId));
    return { ok: true };
  });

/**
 * Links to a target company the caller already picked from
 * `searchTargetCompanies`'s suggestions — the path that keeps duplicate
 * near-identical company records from accumulating in practice (name alone
 * has no uniqueness constraint; only a shared domain dedups automatically).
 * `linkLeadToCompany` (above) is only for a genuinely new company the search
 * didn't find.
 */
export const linkLeadToExistingCompany = authActionClient
  .inputSchema(
    z.object({
      leadId: z.string().uuid(),
      targetCompanyId: z.string().uuid(),
      role: z.enum(["owner", "agent", "employee", "unknown"]).default("unknown"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsLead(ctx.user.companyId, parsedInput.leadId);

    const [target] = await db()
      .select({ id: schema.targetCompanies.id })
      .from(schema.targetCompanies)
      .where(
        and(
          eq(schema.targetCompanies.id, parsedInput.targetCompanyId),
          eq(schema.targetCompanies.companyId, ctx.user.companyId),
        ),
      )
      .limit(1);
    if (!target) throw new ActionError("Company not found.");

    await db().insert(schema.leadTargetCompanyAffiliations).values({
      leadId: parsedInput.leadId,
      targetCompanyId: parsedInput.targetCompanyId,
      role: parsedInput.role,
      startedAt: new Date(),
    });

    updateTag(leadTag(parsedInput.leadId));
    return { ok: true };
  });

export const unlinkLeadFromCompany = authActionClient
  .inputSchema(z.object({ leadId: z.string().uuid(), affiliationId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsLead(ctx.user.companyId, parsedInput.leadId);

    await db()
      .delete(schema.leadTargetCompanyAffiliations)
      .where(
        and(
          eq(schema.leadTargetCompanyAffiliations.id, parsedInput.affiliationId),
          eq(schema.leadTargetCompanyAffiliations.leadId, parsedInput.leadId),
        ),
      );

    updateTag(leadTag(parsedInput.leadId));
    return { ok: true };
  });
