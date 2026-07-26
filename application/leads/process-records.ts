import "server-only";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { applyMapping } from "@/domain/dataset/mapping";
import { classifyWithRules } from "@/domain/scoring/rules-classifier";
import { canonicalLocation } from "@/domain/scoring/extractors";
import type { MappingRules } from "@/domain/dataset/types";
import { NEAR_DUPLICATE_SIMILARITY, NEAR_DUPLICATE_WINDOW_HOURS } from "@/shared/constants";
import type { RawRecordRow } from "@/infrastructure/db/schema/sync";
import { createLogger } from "@/infrastructure/observability/logger";
import { resolveIdentity, recomputePersonRollup } from "./identity-resolution";

const log = createLogger("process-records");

export interface ProcessResult {
  created: number;
  updated: number;
  duplicates: number;
  failed: number;
  spam: number;
  /** Person (lead) ids touched by a new, non-duplicate appearance — alerting candidates. */
  leadIds: string[];
}

/** IDR is the only currency common enough here to be worth a hardcoded floor. */
const FALLBACK_USD_RATES: Record<string, number> = { USD: 1, IDR: 0.000061, EUR: 1.08, AUD: 0.66 };

async function usdRate(currency: string): Promise<number> {
  const [row] = await db()
    .select()
    .from(schema.fxRates)
    .where(eq(schema.fxRates.currency, currency))
    .limit(1);
  return row?.usdPerUnit ?? FALLBACK_USD_RATES[currency] ?? 0;
}

/**
 * Near-duplicate detection between appearances (a repost, or the same item
 * re-scraped) — distinct from and independent of person-level identity merge
 * (`resolveIdentity`). Two appearances with matching `authorExternalId` are
 * already the same person after identity resolution; this additionally links
 * them as the same *appearance* when the text is a near-exact repost, so
 * repost frequency doesn't get double-counted as separate rollup evidence.
 *
 * Reposts are not noise to be deleted — repost frequency is itself an intent
 * signal — so duplicates are *linked* to a canonical appearance rather than
 * dropped, and the UI collapses them.
 */
async function findCanonicalDuplicate(
  body: string,
  authorExternalId: string | null,
  postedAt: Date,
  excludeAppearanceId?: string,
): Promise<string | null> {
  if (body.trim().length < 40) return null;

  const since = new Date(postedAt.getTime() - NEAR_DUPLICATE_WINDOW_HOURS * 3_600_000);

  const conditions = [
    gte(schema.leadAppearances.postedAt, since),
    sql`similarity(${schema.leadAppearances.body}, ${body}) > ${NEAR_DUPLICATE_SIMILARITY}`,
    sql`${schema.leadAppearances.canonicalAppearanceId} IS NULL`,
  ];
  if (authorExternalId) {
    conditions.push(eq(schema.leadAppearances.authorExternalId, authorExternalId));
  }
  if (excludeAppearanceId) {
    conditions.push(ne(schema.leadAppearances.id, excludeAppearanceId));
  }

  const [match] = await db()
    .select({ id: schema.leadAppearances.id })
    .from(schema.leadAppearances)
    .where(and(...conditions))
    .orderBy(schema.leadAppearances.postedAt)
    .limit(1);

  return match?.id ?? null;
}

/**
 * Dedup for `engagement_*` appearances: identity, not text similarity — there's
 * no body to compare. The same like re-scraped always resolves to the same
 * appearance (`authorExternalId` + `targetPostExternalId` match); liking a
 * *different* post stays a separate appearance, since that's a distinct, real
 * signal that rolls up as `repeatEngagementCount` on scoring rather than being
 * deduped away.
 */
async function findEngagementDuplicate(
  authorExternalId: string | null,
  targetPostExternalId: string | null,
  excludeAppearanceId?: string,
): Promise<string | null> {
  if (!authorExternalId || !targetPostExternalId) return null;

  const conditions = [
    eq(schema.leadAppearances.authorExternalId, authorExternalId),
    sql`${schema.leadAppearances.attributes}->'_engagement'->>'targetPostExternalId' = ${targetPostExternalId}`,
    sql`${schema.leadAppearances.canonicalAppearanceId} IS NULL`,
  ];
  if (excludeAppearanceId) conditions.push(ne(schema.leadAppearances.id, excludeAppearanceId));

  const [match] = await db()
    .select({ id: schema.leadAppearances.id })
    .from(schema.leadAppearances)
    .where(and(...conditions))
    .orderBy(schema.leadAppearances.postedAt)
    .limit(1);

  return match?.id ?? null;
}

/** Distinct listings this person engaged with recently — the repeat-engagement signal. */
async function countRecentEngagementTargets(
  authorExternalId: string | null,
  excludeTargetPostExternalId: string | null,
): Promise<number> {
  if (!authorExternalId) return 0;

  const [row] = await db()
    .select({
      count: sql<number>`count(distinct ${schema.leadAppearances.attributes}->'_engagement'->>'targetPostExternalId')::int`,
    })
    .from(schema.leadAppearances)
    .where(
      and(
        eq(schema.leadAppearances.authorExternalId, authorExternalId),
        sql`${schema.leadAppearances.recordKind} != 'content_post'`,
        excludeTargetPostExternalId
          ? sql`${schema.leadAppearances.attributes}->'_engagement'->>'targetPostExternalId' != ${excludeTargetPostExternalId}`
          : sql`true`,
      ),
    );

  return row?.count ?? 0;
}

/**
 * Normalizes, classifies, identity-resolves and persists a batch of raw
 * records. Runs on ingest and on backfill alike.
 *
 * Two-phase per record: (1) classify and upsert the *appearance* — exactly
 * what this function did before `leads` split into `leads`/`lead_appearances`
 * — then (2) resolve the appearance's author to a person (`resolveIdentity`)
 * and recompute that person's rollup (`recomputePersonRollup`). Identity
 * resolution runs before the appearance upsert because `lead_appearances.leadId`
 * is a required FK — every appearance belongs to a person from the moment it's
 * created, never linked up later.
 */
export async function processRawRecords(
  records: RawRecordRow[],
  mappingRules: MappingRules,
  options: {
    passthrough: boolean;
    datasetId: string;
    recordKind?: "content_post" | "engagement_like" | "engagement_comment";
    platform?: "facebook" | "instagram" | "other";
  },
): Promise<ProcessResult> {
  const recordKind = options.recordKind ?? "content_post";
  const platform = options.platform ?? "facebook";
  const isEngagement = recordKind !== "content_post";
  const result: ProcessResult = {
    created: 0,
    updated: 0,
    duplicates: 0,
    failed: 0,
    spam: 0,
    leadIds: [],
  };
  const touchedLeadIds = new Set<string>();

  for (const record of records) {
    try {
      const normalized = applyMapping(record.payload, mappingRules, {
        passthrough: options.passthrough,
      });

      const repeatEngagementCount = isEngagement
        ? await countRecentEngagementTargets(
            normalized.authorExternalId,
            normalized.engagementContext.targetPostExternalId,
          )
        : 0;

      const classification = classifyWithRules({
        body: normalized.body,
        listingTitle: normalized.listingTitle,
        locationRaw: normalized.locationRaw,
        priceRaw: normalized.priceRaw,
        bedrooms: normalized.bedrooms,
        bathrooms: normalized.bathrooms,
        engagement: normalized.engagement,
        sourceGroup: normalized.sourceGroup,
        postedAt: normalized.postedAt,
        recordKind,
        engagementContext: isEngagement
          ? { ...normalized.engagementContext, repeatEngagementCount }
          : undefined,
      });

      const budget = classification.budget;
      const rate = budget ? await usdRate(budget.currency) : 0;

      // Reserved key, not a canonical field — keeps `attributes` the queryable
      // record of what an engagement lead engaged with, and is what the
      // identity-dedup lookup above matches on (see findEngagementDuplicate).
      const attributes = { ...normalized.attributes };
      if (isEngagement && normalized.engagementContext.targetPostExternalId) {
        attributes._engagement = normalized.engagementContext;
      }

      // Identity resolution runs once per appearance, at creation — not on
      // every reprocess. Re-resolving on replay is wasted work at best; at
      // worst, an appearance with no identity signal at all (no author id
      // mapped) would spawn a fresh orphan person on every single reprocess
      // instead of staying linked to the one it was already resolved to,
      // since "no signal" always means "create a new person" (see
      // identity-resolution.ts). An already-existing appearance's `leadId` is
      // as stable as `lead_states` — set once, never re-derived.
      const [existingAppearance] = await db()
        .select({ leadId: schema.leadAppearances.leadId })
        .from(schema.leadAppearances)
        .where(eq(schema.leadAppearances.rawRecordId, record.id))
        .limit(1);

      const leadId =
        existingAppearance?.leadId ??
        (await resolveIdentity({
          facebookId: platform === "facebook" ? normalized.authorExternalId : null,
          instagramId: platform === "instagram" ? normalized.authorExternalId : null,
          profileUrl: normalized.authorUrl,
          username: normalized.authorUsername,
          name: normalized.authorName,
          avatarUrl: normalized.authorAvatarUrl,
          location: normalized.authorLocation,
          bio: normalized.authorBio,
          contact: classification.contact,
        }));

      const values = {
        leadId,
        rawRecordId: record.id,
        datasetId: options.datasetId,
        recordKind,
        platform,
        externalId: normalized.externalId,
        externalUrl: normalized.externalUrl,
        sourceGroup: normalized.sourceGroup,
        authorName: normalized.authorName,
        authorUrl: normalized.authorUrl,
        authorAvatarUrl: normalized.authorAvatarUrl,
        authorExternalId: normalized.authorExternalId,
        authorUsername: normalized.authorUsername,
        authorBio: normalized.authorBio,
        authorLocation: normalized.authorLocation,
        body: normalized.body,
        listingTitle: normalized.listingTitle,
        images: normalized.images,
        postedAt: normalized.postedAt,
        likes: normalized.engagement.likes,
        comments: normalized.engagement.comments,
        shares: normalized.engagement.shares,
        intent: classification.intent,
        intentScore: classification.intentScore,
        qualityScore: classification.qualityScore,
        investorScore: classification.investorScore,
        brokerScore: classification.brokerScore,
        reach: classification.reach,
        scoreReasons: classification.reasons,
        classifierId: classification.classifierId,
        classifiedAt: new Date(classification.classifiedAt),
        propertyTypes: classification.propertyTypes,
        locations: classification.locations.map(canonicalLocation),
        bedrooms: classification.bedrooms,
        bathrooms: classification.bathrooms,
        budgetMin: budget?.min ?? null,
        budgetMax: budget?.max ?? null,
        budgetCurrency: budget?.currency ?? null,
        budgetUsdMin: budget && rate ? Math.round(budget.min! * rate) : null,
        budgetUsdMax: budget && rate ? Math.round(budget.max! * rate) : null,
        contact: classification.contact,
        attributes,
        isSpam: classification.isSpam,
        updatedAt: new Date(),
      };

      // Upserting on rawRecordId is what makes reprocessing idempotent: the same
      // record always resolves to the same appearance row. `xmax = 0` is the
      // standard Postgres tell for "this returned row was inserted, not
      // updated, by this statement" — a wall-clock-age check on `createdAt` is
      // a racier substitute (a resync completing within the same window as the
      // original ingest, or two records in a batch landing close together,
      // misclassifies an update as new).
      const [appearance] = await db()
        .insert(schema.leadAppearances)
        .values(values)
        .onConflictDoUpdate({ target: schema.leadAppearances.rawRecordId, set: values })
        .returning({
          id: schema.leadAppearances.id,
          inserted: sql<boolean>`(xmax = 0)`,
        });

      const isNew = appearance.inserted;
      if (isNew) result.created += 1;
      else result.updated += 1;
      if (classification.isSpam) result.spam += 1;

      const canonicalId = isEngagement
        ? await findEngagementDuplicate(
            normalized.authorExternalId,
            normalized.engagementContext.targetPostExternalId,
            appearance.id,
          )
        : await findCanonicalDuplicate(
            normalized.body,
            normalized.authorExternalId,
            normalized.postedAt,
            appearance.id,
          );

      if (canonicalId) {
        await db()
          .update(schema.leadAppearances)
          .set({ canonicalAppearanceId: canonicalId })
          .where(eq(schema.leadAppearances.id, appearance.id));
        result.duplicates += 1;
      }

      // Human state is created once and never touched again by the pipeline —
      // as soon as a person has any appearance, whether or not this specific
      // one turned out to be a duplicate.
      await db().insert(schema.leadStates).values({ leadId }).onConflictDoNothing();

      // Recomputed regardless of duplicate status: reprocessing (a mapping
      // change, a reclassification) can change which appearances count as
      // duplicates, so the rollup has to stay correct under replay, not just
      // on first ingest.
      await recomputePersonRollup(leadId);

      if (isNew && !canonicalId) touchedLeadIds.add(leadId);
    } catch (error) {
      result.failed += 1;
      log.error("failed to process record", { error, recordId: record.id, datasetId: options.datasetId });
    }
  }

  result.leadIds = [...touchedLeadIds];
  return result;
}
