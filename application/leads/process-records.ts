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

const log = createLogger("process-records");

export interface ProcessResult {
  created: number;
  updated: number;
  duplicates: number;
  failed: number;
  spam: number;
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
 * Near-duplicate detection.
 *
 * Reposts are common and are not noise to be deleted — repost frequency is
 * itself an intent signal — so duplicates are *linked* to a canonical lead
 * rather than dropped, and the UI collapses them.
 */
async function findCanonicalDuplicate(
  body: string,
  authorExternalId: string | null,
  postedAt: Date,
  excludeLeadId?: string,
): Promise<string | null> {
  if (body.trim().length < 40) return null;

  const since = new Date(postedAt.getTime() - NEAR_DUPLICATE_WINDOW_HOURS * 3_600_000);

  const conditions = [
    gte(schema.leads.postedAt, since),
    sql`similarity(${schema.leads.body}, ${body}) > ${NEAR_DUPLICATE_SIMILARITY}`,
    sql`${schema.leads.canonicalLeadId} IS NULL`,
  ];
  if (authorExternalId) {
    conditions.push(eq(schema.leads.authorExternalId, authorExternalId));
  }
  if (excludeLeadId) {
    conditions.push(ne(schema.leads.id, excludeLeadId));
  }

  const [match] = await db()
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(...conditions))
    .orderBy(schema.leads.postedAt)
    .limit(1);

  return match?.id ?? null;
}

/**
 * Normalizes, classifies and persists a batch of raw records.
 *
 * Runs on ingest and on backfill alike. Classification happens exactly once per
 * record rather than per request — the old fetch-everything-and-classify model
 * would re-bill an LLM for the whole corpus on every cold cache.
 */
export async function processRawRecords(
  records: RawRecordRow[],
  mappingRules: MappingRules,
  options: { passthrough: boolean; datasetId: string },
): Promise<ProcessResult> {
  const result: ProcessResult = {
    created: 0,
    updated: 0,
    duplicates: 0,
    failed: 0,
    spam: 0,
    leadIds: [],
  };

  for (const record of records) {
    try {
      const normalized = applyMapping(record.payload, mappingRules, {
        passthrough: options.passthrough,
      });

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
      });

      const budget = classification.budget;
      const rate = budget ? await usdRate(budget.currency) : 0;

      const values = {
        rawRecordId: record.id,
        datasetId: options.datasetId,
        externalId: normalized.externalId,
        externalUrl: normalized.externalUrl,
        sourceGroup: normalized.sourceGroup,
        authorName: normalized.authorName,
        authorUrl: normalized.authorUrl,
        authorAvatarUrl: normalized.authorAvatarUrl,
        authorExternalId: normalized.authorExternalId,
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
        attributes: normalized.attributes,
        isSpam: classification.isSpam,
        updatedAt: new Date(),
      };

      // Upserting on rawRecordId is what makes reprocessing idempotent: the same
      // record always resolves to the same lead row. `xmax = 0` is the standard
      // Postgres tell for "this returned row was inserted, not updated, by this
      // statement" — a wall-clock-age check on `createdAt` is a racier substitute
      // (a resync completing within the same window as the original ingest, or two
      // records in a batch landing close together, misclassifies an update as new).
      const [lead] = await db()
        .insert(schema.leads)
        .values(values)
        .onConflictDoUpdate({ target: schema.leads.rawRecordId, set: values })
        .returning({
          id: schema.leads.id,
          inserted: sql<boolean>`(xmax = 0)`,
        });

      const isNew = lead.inserted;
      if (isNew) result.created += 1;
      else result.updated += 1;
      if (classification.isSpam) result.spam += 1;

      const canonicalId = await findCanonicalDuplicate(
        normalized.body,
        normalized.authorExternalId,
        normalized.postedAt,
        lead.id,
      );
      if (canonicalId) {
        await db()
          .update(schema.leads)
          .set({ canonicalLeadId: canonicalId })
          .where(eq(schema.leads.id, lead.id));
        result.duplicates += 1;
      } else {
        // Human state is created once and never touched again by the pipeline.
        await db().insert(schema.leadStates).values({ leadId: lead.id }).onConflictDoNothing();
        if (isNew) result.leadIds.push(lead.id);
      }
    } catch (error) {
      result.failed += 1;
      log.error("failed to process record", { error, recordId: record.id, datasetId: options.datasetId });
    }
  }

  return result;
}
