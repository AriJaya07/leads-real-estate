import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import {
  identityKeys,
  mergePersonalInfo,
  normalizeProfileUrl,
  type IdentityCandidate,
  type PersonalInfo,
} from "@/domain/lead/identity";
import { rollupPersonScores, type AppearanceForRollup } from "@/domain/scoring/lead-rollup";
import { scoreAndValidateLead } from "@/domain/scoring/lead-validation";
import type { ContactInfo } from "@/domain/scoring/types";
import { incrementMonthlyLeadUsage } from "@/application/billing/usage";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("identity-resolution");

/** Postgres SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === UNIQUE_VIOLATION);
}

export interface AppearanceIdentitySnapshot extends IdentityCandidate {
  name: string | null;
  avatarUrl: string | null;
  location: string | null;
  bio: string | null;
  contact: ContactInfo;
}

/**
 * AND'd with `companyId` — the actual identity-merge correctness fix. Without
 * this, two different companies scraping the same public facebookId would
 * still find and merge into each other's leads, even with the composite
 * `(company_id, facebook_id)` unique index in place (that index only stops a
 * *conflicting insert*; this is what stops the *lookup* from crossing tenants
 * in the first place). See docs/saas-platform-architecture.md.
 */
function matchCondition(
  companyId: string,
  key: { type: "facebookId" | "instagramId" | "profileUrl"; value: string },
) {
  if (key.type === "facebookId") {
    return and(eq(schema.leads.companyId, companyId), eq(schema.leads.facebookId, key.value));
  }
  if (key.type === "instagramId") {
    return and(eq(schema.leads.companyId, companyId), eq(schema.leads.instagramId, key.value));
  }
  return and(eq(schema.leads.companyId, companyId), eq(schema.leads.profileUrl, key.value));
}

/**
 * Which identity field actually caused `existing` to match `candidate`, in
 * the same facebookId → instagramId → profileUrl precedence
 * `domain/lead/identity.ts` uses — purely descriptive, computed after the
 * fact for the `merged` audit event below; doesn't change matching itself.
 */
function matchedIdentityField(
  existing: PersonalInfo,
  candidate: AppearanceIdentitySnapshot,
): "facebookId" | "instagramId" | "profileUrl" | null {
  if (candidate.facebookId && existing.facebookId === candidate.facebookId) return "facebookId";
  if (candidate.instagramId && existing.instagramId === candidate.instagramId) return "instagramId";
  const normalized = normalizeProfileUrl(candidate.profileUrl);
  if (normalized && existing.profileUrl === normalized) return "profileUrl";
  return null;
}

function toPersonalInfo(row: {
  facebookId: string | null;
  instagramId: string | null;
  profileUrl: string | null;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  location: string | null;
  bio: string | null;
}): PersonalInfo {
  return {
    facebookId: row.facebookId,
    instagramId: row.instagramId,
    profileUrl: row.profileUrl,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatarUrl,
    location: row.location,
    bio: row.bio,
  };
}

export interface IdentityResolution {
  leadId: string;
  /** True when this candidate matched an *existing* person rather than creating a new one — see `application/leads/split-lead.ts` for the undo path. */
  merged: boolean;
  matchedField: "facebookId" | "instagramId" | "profileUrl" | null;
}

/**
 * Finds an existing person by exact identity match — `facebookId`, then
 * `instagramId`, then normalized `profileUrl`, in that precedence order — or
 * creates a new one. An existing match gets any identity/personal-info fields
 * it was missing filled in (never overwritten — see
 * `domain/lead/identity.ts::mergePersonalInfo`).
 *
 * Doesn't log the `merged` lead event itself — the caller
 * (`process-records.ts`) does, once the appearance row that triggered this
 * call actually has an id, since the split-undo path needs that id in the
 * event payload and it doesn't exist yet at this point in the pipeline.
 *
 * Race-safe: two concurrent ingests resolving the same new identity both miss
 * the initial SELECT, one wins the INSERT, the other catches the unique
 * violation from `leads_facebook_id_key`/`leads_instagram_id_key`/
 * `leads_profile_url_key` and re-reads the winner's row instead of erroring.
 */
export async function resolveIdentity(
  companyId: string,
  candidate: AppearanceIdentitySnapshot,
): Promise<IdentityResolution> {
  const keys = identityKeys(candidate);

  if (keys.length > 0) {
    const [existing] = await db()
      .select()
      .from(schema.leads)
      .where(or(...keys.map((key) => matchCondition(companyId, key))))
      .limit(1);

    if (existing) {
      const merged = mergePersonalInfo(toPersonalInfo(existing), {
        facebookId: candidate.facebookId ?? null,
        instagramId: candidate.instagramId ?? null,
        profileUrl: normalizeProfileUrl(candidate.profileUrl),
        username: candidate.username ?? null,
        name: candidate.name,
        avatarUrl: candidate.avatarUrl,
        location: candidate.location,
        bio: candidate.bio,
      });

      const changed = (Object.keys(merged) as (keyof PersonalInfo)[]).some(
        (key) => merged[key] !== toPersonalInfo(existing)[key],
      );
      const contactChanged =
        !existing.contact?.phone && !existing.contact?.whatsapp && !existing.contact?.email
          ? Boolean(candidate.contact.phone || candidate.contact.whatsapp || candidate.contact.email)
          : false;

      if (changed || contactChanged) {
        await db()
          .update(schema.leads)
          .set({
            ...merged,
            contact: contactChanged ? { ...existing.contact, ...candidate.contact } : existing.contact,
            updatedAt: new Date(),
          })
          .where(eq(schema.leads.id, existing.id));
      }

      return { leadId: existing.id, merged: true, matchedField: matchedIdentityField(toPersonalInfo(existing), candidate) };
    }

    try {
      const [created] = await db()
        .insert(schema.leads)
        .values({
          companyId,
          facebookId: candidate.facebookId ?? null,
          instagramId: candidate.instagramId ?? null,
          profileUrl: normalizeProfileUrl(candidate.profileUrl),
          username: candidate.username ?? null,
          name: candidate.name,
          avatarUrl: candidate.avatarUrl,
          location: candidate.location,
          bio: candidate.bio,
          contact: candidate.contact,
        })
        .returning({ id: schema.leads.id });
      await incrementMonthlyLeadUsage(companyId);
      return { leadId: created.id, merged: false, matchedField: null };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [winner] = await db()
        .select()
        .from(schema.leads)
        .where(or(...keys.map((key) => matchCondition(companyId, key))))
        .limit(1);
      if (winner) {
        return { leadId: winner.id, merged: true, matchedField: matchedIdentityField(toPersonalInfo(winner), candidate) };
      }
      throw error;
    }
  }

  // No facebookId/instagramId/profileUrl at all — can't merge without an
  // identity signal, so this always becomes its own person. The partial
  // unique indexes on `leads` explicitly exclude NULL, so multiple such rows
  // never conflict with each other.
  const [created] = await db()
    .insert(schema.leads)
    .values({
      companyId,
      username: candidate.username ?? null,
      name: candidate.name,
      avatarUrl: candidate.avatarUrl,
      location: candidate.location,
      bio: candidate.bio,
      contact: candidate.contact,
    })
    .returning({ id: schema.leads.id });
  await incrementMonthlyLeadUsage(companyId);
  return { leadId: created.id, merged: false, matchedField: null };
}

/**
 * Recomputes and persists a person's AI-analysis rollup from every current
 * non-spam, non-duplicate appearance they have. Called after every appearance
 * upsert that isn't itself a duplicate — cheap (one indexed query on
 * `lead_appearances_lead_idx`) and idempotent, same "derived, freely
 * regenerable" contract as the appearance-level scores it reads.
 */
export async function recomputePersonRollup(companyId: string, leadId: string): Promise<void> {
  const rows = await db()
    .select({
      intent: schema.leadAppearances.intent,
      intentScore: schema.leadAppearances.intentScore,
      investorScore: schema.leadAppearances.investorScore,
      brokerScore: schema.leadAppearances.brokerScore,
      recordKind: schema.leadAppearances.recordKind,
      propertyTypes: schema.leadAppearances.propertyTypes,
      locations: schema.leadAppearances.locations,
      contact: schema.leadAppearances.contact,
      postedAt: schema.leadAppearances.postedAt,
      scoreReasons: schema.leadAppearances.scoreReasons,
      likes: schema.leadAppearances.likes,
      comments: schema.leadAppearances.comments,
      shares: schema.leadAppearances.shares,
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

  const appearances: AppearanceForRollup[] = rows.map((row) => ({
    intent: row.intent,
    intentScore: row.intentScore,
    investorScore: row.investorScore,
    brokerScore: row.brokerScore,
    recordKind: row.recordKind,
    propertyTypes: row.propertyTypes,
    locations: row.locations,
    hasContact: Boolean(row.contact?.phone || row.contact?.whatsapp || row.contact?.email),
    postedAt: row.postedAt,
    scoreReasons: row.scoreReasons,
  }));

  const rollup = rollupPersonScores(appearances);

  // Most-recently-posted non-null budget wins — a stated budget can change
  // over time; range-merging across appearances risks a nonsensical combined
  // range more than it risks staleness. A plain "most recent" pick, not a
  // scoring decision, so it's computed here rather than in the pure rollup.
  const [budgetSource] = await db()
    .select({
      budgetMin: schema.leadAppearances.budgetMin,
      budgetMax: schema.leadAppearances.budgetMax,
      budgetCurrency: schema.leadAppearances.budgetCurrency,
      budgetUsdMin: schema.leadAppearances.budgetUsdMin,
      budgetUsdMax: schema.leadAppearances.budgetUsdMax,
    })
    .from(schema.leadAppearances)
    .where(
      and(
        eq(schema.leadAppearances.companyId, companyId),
        eq(schema.leadAppearances.leadId, leadId),
        eq(schema.leadAppearances.isSpam, false),
        isNull(schema.leadAppearances.canonicalAppearanceId),
        sql`${schema.leadAppearances.budgetCurrency} IS NOT NULL`,
      ),
    )
    .orderBy(desc(schema.leadAppearances.postedAt))
    .limit(1);

  // Current identity/contact fields — already written by `resolveIdentity`
  // earlier in the same request (or an earlier one); this rollup only *reads*
  // them, same division of labour `mergePersonalInfo` already established.
  const [identity] = await db()
    .select({
      name: schema.leads.name,
      avatarUrl: schema.leads.avatarUrl,
      bio: schema.leads.bio,
      username: schema.leads.username,
      profileUrl: schema.leads.profileUrl,
      location: schema.leads.location,
      contact: schema.leads.contact,
    })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.companyId, companyId)))
    .limit(1);

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

  // Customer data validation and lead scoring (domain/scoring/lead-validation.ts) —
  // a different question from the rollup above ("what does this person's text
  // say"): this grades the record itself, persisted so the dashboard can
  // filter/sort by it without recomputing per row. See
  // application/leads/lead-validation.ts for the on-demand, richer (breakdown +
  // reasons) version used by the lead detail sheet.
  const validation = scoreAndValidateLead({
    name: identity?.name ?? null,
    avatarUrl: identity?.avatarUrl ?? null,
    bio: identity?.bio ?? null,
    username: identity?.username ?? null,
    profileUrl: identity?.profileUrl ?? null,
    location: identity?.location ?? null,
    propertyTypes: rollup.propertyTypes,
    budgetUsdMin: budgetSource?.budgetUsdMin ?? null,
    budgetUsdMax: budgetSource?.budgetUsdMax ?? null,
    leadType: rollup.leadType,
    contact: identity?.contact ?? {},
    buyerScore: rollup.buyerScore,
    sellerScore: rollup.sellerScore,
    investorScore: rollup.investorScore,
    confidenceScore: rollup.confidenceScore,
    affiliatedIndustries,
    locations: rollup.locations,
    appearanceCount: rollup.appearanceCount,
    latestAppearanceAt: rollup.latestAppearanceAt,
    totalLikes: rows.reduce((sum, r) => sum + r.likes, 0),
    totalComments: rows.reduce((sum, r) => sum + r.comments, 0),
    totalShares: rows.reduce((sum, r) => sum + r.shares, 0),
  });

  await db()
    .update(schema.leads)
    .set({
      leadType: rollup.leadType,
      buyerScore: rollup.buyerScore,
      sellerScore: rollup.sellerScore,
      investorScore: rollup.investorScore,
      confidenceScore: rollup.confidenceScore,
      aiExplanation: rollup.aiExplanation,
      classifierId: "rules-rollup@1",
      classifiedAt: new Date(),
      propertyTypes: rollup.propertyTypes,
      locations: rollup.locations,
      budgetMin: budgetSource?.budgetMin ?? null,
      budgetMax: budgetSource?.budgetMax ?? null,
      budgetCurrency: budgetSource?.budgetCurrency ?? null,
      budgetUsdMin: budgetSource?.budgetUsdMin ?? null,
      budgetUsdMax: budgetSource?.budgetUsdMax ?? null,
      latestAppearanceAt: rollup.latestAppearanceAt,
      appearanceCount: rollup.appearanceCount,
      leadScore: validation.leadScore,
      dataQualityTier: validation.validationResult,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.companyId, companyId)));

  log.debug("rollup recomputed", { leadId, leadType: rollup.leadType, appearanceCount: rollup.appearanceCount });
}
