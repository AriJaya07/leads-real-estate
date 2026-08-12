import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { currentMonthBounds } from "@/application/billing/usage";

export interface PlatformAnalytics {
  tenantsByStatus: { status: string; count: number }[];
  leadsThisMonthAcrossPlatform: number;
  leadsLastMonthAcrossPlatform: number;
  apifyRequestsThisMonthAcrossPlatform: number;
}

/**
 * Platform-wide totals, not per-tenant — same "usage counters and counts
 * only, never a row out of `leads`" boundary as `tenants.queries.ts`. This
 * is the one page that answers "is the platform as a whole growing," which
 * a per-tenant view can't show without manually summing 142 rows.
 */
export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  const { start: thisMonthStart } = currentMonthBounds();
  const thisMonthDate = new Date(thisMonthStart);
  const lastMonthReference = new Date(
    Date.UTC(thisMonthDate.getUTCFullYear(), thisMonthDate.getUTCMonth() - 1, 1),
  );
  // `currentMonthBounds()` returns "YYYY-MM-DD" strings, matched against
  // `usage_counters.period_start`'s `date` column — a raw JS `Date` object
  // passed into the `sql` template instead mismatches that column's type at
  // the driver level. Reuse the same helper (fed a reference date inside
  // last month) rather than hand-rolling a second string format.
  const { start: lastMonthStart } = currentMonthBounds(lastMonthReference);

  const [tenantsByStatus, leadsThisMonth, leadsLastMonth, apifyThisMonth] = await Promise.all([
    db()
      .select({ status: schema.companies.status, count: sql<number>`count(*)::int` })
      .from(schema.companies)
      .groupBy(schema.companies.status),
    db()
      .select({ total: sql<number>`coalesce(sum(${schema.usageCounters.value}), 0)::int` })
      .from(schema.usageCounters)
      .where(
        sql`${schema.usageCounters.metric} = 'leads_this_month' AND ${schema.usageCounters.periodStart} = ${thisMonthStart}`,
      ),
    db()
      .select({ total: sql<number>`coalesce(sum(${schema.usageCounters.value}), 0)::int` })
      .from(schema.usageCounters)
      .where(
        sql`${schema.usageCounters.metric} = 'leads_this_month' AND ${schema.usageCounters.periodStart} = ${lastMonthStart}`,
      ),
    db()
      .select({ total: sql<number>`coalesce(sum(${schema.usageCounters.value}), 0)::int` })
      .from(schema.usageCounters)
      .where(
        sql`${schema.usageCounters.metric} = 'apify_requests_month' AND ${schema.usageCounters.periodStart} = ${thisMonthStart}`,
      ),
  ]);

  return {
    tenantsByStatus,
    leadsThisMonthAcrossPlatform: leadsThisMonth[0]?.total ?? 0,
    leadsLastMonthAcrossPlatform: leadsLastMonth[0]?.total ?? 0,
    apifyRequestsThisMonthAcrossPlatform: apifyThisMonth[0]?.total ?? 0,
  };
}
