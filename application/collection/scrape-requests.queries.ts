import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import type { ScrapeRequestRow } from "@/infrastructure/db/schema/collection";
import { getUsageSummary } from "@/application/billing/usage";

export async function listScrapeRequests(companyId: string, limit = 50): Promise<ScrapeRequestRow[]> {
  return db()
    .select()
    .from(schema.scrapeRequests)
    .where(eq(schema.scrapeRequests.companyId, companyId))
    .orderBy(desc(schema.scrapeRequests.requestedAt))
    .limit(limit);
}

export interface CollectionOverview {
  requests30d: number;
  succeeded30d: number;
  failed30d: number;
  itemsCollected30d: number;
  /** Sum of `usageUsd` across every request with a known cost — the "monitor API costs" view. */
  estimatedCostUsd30d: number;
  apifyRequestsThisMonth: { used: number; limit: number };
}

/** Backs the stat row on the "Collect data" admin page. */
export async function getCollectionOverview(companyId: string): Promise<CollectionOverview> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [row] = await db()
    .select({
      requests: sql<number>`count(*)::int`,
      succeeded: sql<number>`count(*) FILTER (WHERE ${schema.scrapeRequests.status} = 'succeeded')::int`,
      failed: sql<number>`count(*) FILTER (WHERE ${schema.scrapeRequests.status} IN ('failed', 'timed_out', 'aborted'))::int`,
      items: sql<number>`coalesce(sum(${schema.scrapeRequests.itemCount}), 0)::int`,
      cost: sql<number>`coalesce(sum(${schema.scrapeRequests.usageUsd}), 0)::float`,
    })
    .from(schema.scrapeRequests)
    .where(and(eq(schema.scrapeRequests.companyId, companyId), gte(schema.scrapeRequests.requestedAt, since)));

  const usage = await getUsageSummary(companyId);

  return {
    requests30d: row?.requests ?? 0,
    succeeded30d: row?.succeeded ?? 0,
    failed30d: row?.failed ?? 0,
    itemsCollected30d: row?.items ?? 0,
    estimatedCostUsd30d: row?.cost ?? 0,
    apifyRequestsThisMonth: usage?.apifyRequestsThisMonth ?? { used: 0, limit: 0 },
  };
}
