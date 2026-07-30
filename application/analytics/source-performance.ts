import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

export interface SourcePerformance {
  sourceId: string;
  sourceName: string;
  leadCount: number;
  buyerCount: number;
  avgBuyerScore: number | null;
  contactedCount: number;
  closedCount: number;
  closedRevenueUsd: number;
  /** `closedCount / leadCount` — this source's own conversion rate, comparable across sources. */
  conversionPct: number;
}

/**
 * Per-source lead volume and outcomes — "which source actually produces
 * customers, not just leads."
 *
 * A person can have appearances from more than one source (the same buyer
 * posting in a Facebook group and an Instagram group both feeding this
 * company's data) — that lead's outcome is credited to *every* source it
 * came through, the same full-credit multi-attribution convention
 * `facets.ts`'s "Data source" facet already uses for lead counts, applied
 * consistently here to the outcome metrics too rather than silently
 * inventing a different, unexplained split for revenue specifically.
 *
 * Deduplicates (source, lead) pairs *before* joining to `leads`/`lead_states`
 * — a lead with five appearances in the same source must not have its
 * `buyerScore` counted five times into that source's average.
 */
export async function getSourcePerformance(companyId: string): Promise<SourcePerformance[]> {
  const leadSourcePairs = db()
    .selectDistinct({
      sourceId: schema.sources.id,
      sourceName: schema.sources.name,
      leadId: schema.leadAppearances.leadId,
    })
    .from(schema.leadAppearances)
    .innerJoin(schema.datasets, eq(schema.datasets.id, schema.leadAppearances.datasetId))
    .innerJoin(schema.sources, eq(schema.sources.id, schema.datasets.sourceId))
    .where(
      and(
        eq(schema.leadAppearances.companyId, companyId),
        eq(schema.leadAppearances.isSpam, false),
        isNull(schema.leadAppearances.canonicalAppearanceId),
      ),
    )
    .as("lead_source_pairs");

  const rows = await db()
    .select({
      sourceId: leadSourcePairs.sourceId,
      sourceName: leadSourcePairs.sourceName,
      leadCount: sql<number>`count(*)::int`,
      buyerCount: sql<number>`count(*) FILTER (WHERE ${schema.leads.leadType} = 'buyer')::int`,
      avgBuyerScore: sql<number | null>`avg(${schema.leads.buyerScore})`,
      contactedCount: sql<number>`count(*) FILTER (WHERE ${schema.leadStates.firstContactedAt} IS NOT NULL)::int`,
      closedCount: sql<number>`count(*) FILTER (WHERE ${schema.leadStates.status} = 'closed')::int`,
      closedRevenueUsd: sql<number>`coalesce(sum(${schema.leadStates.dealValueUsd}) FILTER (WHERE ${schema.leadStates.status} = 'closed'), 0)::int`,
    })
    .from(leadSourcePairs)
    // `leadSourcePairs.leadId` is already scoped to this company (via
    // `lead_appearances.company_id` in the subquery above) — the explicit
    // `companyId` checks on these two joins are defense-in-depth, not a
    // correctness fix for known-good data, same reasoning as
    // `agent-performance.ts`'s identical comment.
    .innerJoin(schema.leads, and(eq(schema.leads.id, leadSourcePairs.leadId), eq(schema.leads.companyId, companyId)))
    .leftJoin(
      schema.leadStates,
      and(eq(schema.leadStates.leadId, leadSourcePairs.leadId), eq(schema.leadStates.companyId, companyId)),
    )
    .groupBy(leadSourcePairs.sourceId, leadSourcePairs.sourceName)
    .orderBy(desc(sql`count(*)`));

  return rows.map((row) => ({
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    leadCount: row.leadCount,
    buyerCount: row.buyerCount,
    avgBuyerScore: row.avgBuyerScore === null ? null : Math.round(Number(row.avgBuyerScore)),
    contactedCount: row.contactedCount,
    closedCount: row.closedCount,
    closedRevenueUsd: row.closedRevenueUsd,
    conversionPct: row.leadCount === 0 ? 0 : (row.closedCount / row.leadCount) * 100,
  }));
}
