import "server-only";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { currentMonthBounds } from "@/application/billing/usage";

export interface CompanyUsageRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  apifyRequestsThisMonth: number;
  leadsThisMonth: number;
  datasetCount: number;
}

/**
 * Cross-company usage overview for the platform operator — see
 * docs/multi-tenant-apify-isolation-plan.md §3. Deliberately reads only
 * `usage_counters` (already company-scoped, already the numbers billing
 * enforcement uses — `application/billing/usage.ts`) and aggregate counts,
 * never `leads`/`lead_appearances`/`raw_records` directly: this view answers
 * "how much is each tenant using," not "what is each tenant's data." Keep it
 * that way — the moment this reads actual lead rows across companies, the
 * tenant isolation the rest of the platform is built on
 * (docs/saas-platform-architecture.md §5) is compromised for real.
 *
 * Same inline-subquery shape `application/datasets/dataset-queries.ts::listDatasets`
 * already uses for its own per-row aggregate columns, applied one level up
 * (per-company instead of per-dataset).
 */
export async function getCompanyUsageOverview(): Promise<CompanyUsageRow[]> {
  const { start } = currentMonthBounds();

  const rows = await db()
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      slug: schema.companies.slug,
      status: schema.companies.status,
      apifyRequestsThisMonth: sql<number>`coalesce((
        SELECT value FROM ${schema.usageCounters}
        WHERE ${schema.usageCounters.companyId} = ${schema.companies.id}
          AND ${schema.usageCounters.metric} = 'apify_requests_month'
          AND ${schema.usageCounters.periodStart} = ${start}
      ), 0)::int`,
      leadsThisMonth: sql<number>`coalesce((
        SELECT value FROM ${schema.usageCounters}
        WHERE ${schema.usageCounters.companyId} = ${schema.companies.id}
          AND ${schema.usageCounters.metric} = 'leads_this_month'
          AND ${schema.usageCounters.periodStart} = ${start}
      ), 0)::int`,
      datasetCount: sql<number>`(
        SELECT count(*)::int FROM ${schema.datasets}
        WHERE ${schema.datasets.companyId} = ${schema.companies.id}
          AND ${schema.datasets.status} != 'archived'
      )`,
    })
    .from(schema.companies)
    .orderBy(
      // Highest Apify usage first — same "repeat the subquery in orderBy"
      // shape `listDatasets` already uses for its own aggregate columns.
      desc(sql`coalesce((
        SELECT value FROM ${schema.usageCounters}
        WHERE ${schema.usageCounters.companyId} = ${schema.companies.id}
          AND ${schema.usageCounters.metric} = 'apify_requests_month'
          AND ${schema.usageCounters.periodStart} = ${start}
      ), 0)`),
    );

  return rows;
}
