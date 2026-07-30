import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { scoreAndValidateLead, type LeadValidationResult } from "@/domain/scoring/lead-validation";

/**
 * Loads everything `scoreAndValidateLead` needs for one lead and runs it —
 * the application-layer entry point for "customer data validation and lead
 * scoring." Plain orchestration module (no `"use server"`), same reasoning as
 * `application/sync/sync-dataset.ts`: called from a route today, and nothing
 * stops another caller (a digest, a bulk re-score job) from reusing it later
 * without going through an action/session.
 */
export async function getLeadValidation(companyId: string, leadId: string): Promise<LeadValidationResult | null> {
  const [lead] = await db()
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.companyId, companyId)))
    .limit(1);
  if (!lead) return null;

  const industryRows = await db()
    .select({ industry: schema.targetCompanies.industry })
    .from(schema.leadTargetCompanyAffiliations)
    .innerJoin(
      schema.targetCompanies,
      eq(schema.targetCompanies.id, schema.leadTargetCompanyAffiliations.targetCompanyId),
    )
    .where(
      and(
        eq(schema.leadTargetCompanyAffiliations.leadId, leadId),
        eq(schema.targetCompanies.companyId, companyId),
      ),
    );
  const affiliatedIndustries = industryRows.map((r) => r.industry).filter((i): i is string => Boolean(i));

  const [engagement] = await db()
    .select({
      totalLikes: sql<number>`coalesce(sum(${schema.leadAppearances.likes}), 0)::int`,
      totalComments: sql<number>`coalesce(sum(${schema.leadAppearances.comments}), 0)::int`,
      totalShares: sql<number>`coalesce(sum(${schema.leadAppearances.shares}), 0)::int`,
    })
    .from(schema.leadAppearances)
    .where(
      and(
        eq(schema.leadAppearances.companyId, companyId),
        eq(schema.leadAppearances.leadId, leadId),
        eq(schema.leadAppearances.isSpam, false),
        isNull(schema.leadAppearances.canonicalAppearanceId),
      ),
    );

  return scoreAndValidateLead({
    name: lead.name,
    avatarUrl: lead.avatarUrl,
    bio: lead.bio,
    username: lead.username,
    profileUrl: lead.profileUrl,
    location: lead.location,
    propertyTypes: lead.propertyTypes,
    budgetUsdMin: lead.budgetUsdMin,
    budgetUsdMax: lead.budgetUsdMax,
    leadType: lead.leadType,
    contact: lead.contact,
    buyerScore: lead.buyerScore,
    sellerScore: lead.sellerScore,
    investorScore: lead.investorScore,
    confidenceScore: lead.confidenceScore,
    affiliatedIndustries,
    locations: lead.locations,
    appearanceCount: lead.appearanceCount,
    latestAppearanceAt: lead.latestAppearanceAt,
    totalLikes: engagement?.totalLikes ?? 0,
    totalComments: engagement?.totalComments ?? 0,
    totalShares: engagement?.totalShares ?? 0,
  });
}
