import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { currentMonthBounds } from "@/application/billing/usage";

export interface TenantOverviewStats {
  activeTenants: number;
  tenantsWithSyncIssues: number;
  trialsEndingSoon: number;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  categoryLabel: string;
  status: string;
  apifyRequestsThisMonth: number;
  leadsThisMonth: number;
  datasetCount: number;
  /** "Healthy" unless at least one non-archived dataset is stale/degraded/drifted/erroring. */
  health: "healthy" | "issues";
}

const TRIAL_ENDING_WINDOW_DAYS = 7;

/**
 * Cross-company overview for the platform operator — see
 * docs/multi-tenant-apify-isolation-plan.md §3. Deliberately reads only
 * `usage_counters` (already company-scoped, already the numbers billing
 * enforcement uses — `application/billing/usage.ts`), dataset
 * counts/health, and company/subscription metadata — never
 * `leads`/`lead_appearances`/`raw_records` directly: this view answers "how
 * is each tenant doing operationally," not "what is each tenant's data."
 * Keep it that way — the moment this reads actual lead rows across
 * companies, the tenant isolation the rest of the platform is built on
 * (docs/saas-platform-architecture.md §5) is compromised for real.
 */
export async function getTenantOverview(): Promise<{ stats: TenantOverviewStats; tenants: TenantRow[] }> {
  const { start } = currentMonthBounds();
  const trialCutoff = new Date(Date.now() + TRIAL_ENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db()
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      slug: schema.companies.slug,
      categoryLabel: schema.categories.label,
      status: schema.companies.status,
      trialEndsAt: schema.companies.trialEndsAt,
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
      hasSyncIssue: sql<boolean>`exists (
        SELECT 1 FROM ${schema.datasets}
        WHERE ${schema.datasets.companyId} = ${schema.companies.id}
          AND ${schema.datasets.status} != 'archived'
          AND ${schema.datasets.health} NOT IN ('healthy', 'unknown')
      )`,
    })
    .from(schema.companies)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.companies.categoryId))
    .orderBy(
      desc(sql`coalesce((
        SELECT value FROM ${schema.usageCounters}
        WHERE ${schema.usageCounters.companyId} = ${schema.companies.id}
          AND ${schema.usageCounters.metric} = 'apify_requests_month'
          AND ${schema.usageCounters.periodStart} = ${start}
      ), 0)`),
    );

  const tenants: TenantRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    categoryLabel: row.categoryLabel,
    status: row.status,
    apifyRequestsThisMonth: row.apifyRequestsThisMonth,
    leadsThisMonth: row.leadsThisMonth,
    datasetCount: row.datasetCount,
    health: row.hasSyncIssue ? "issues" : "healthy",
  }));

  const stats: TenantOverviewStats = {
    activeTenants: rows.filter((r) => r.status === "active" || r.status === "trialing").length,
    tenantsWithSyncIssues: rows.filter((r) => r.hasSyncIssue).length,
    trialsEndingSoon: rows.filter(
      (r) => r.status === "trialing" && r.trialEndsAt !== null && r.trialEndsAt <= trialCutoff,
    ).length,
  };

  return { stats, tenants };
}
