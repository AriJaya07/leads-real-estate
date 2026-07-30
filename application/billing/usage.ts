import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { db, schema, type Database } from "@/infrastructure/db/client";
import type { PlanFeatures } from "@/domain/billing/plan-features";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("usage");

export interface CompanyPlan {
  planId: string;
  planName: string;
  /** `null` = unlimited — Enterprise's actual selling point for this one. */
  maxSeats: number | null;
  maxDatasets: number;
  /** "Data fetch limit" — raw records ingested per month, every source kind. */
  maxRawRecordsPerMonth: number;
  /** Unique leads identified per month (post-dedup), a business-value metric. */
  maxLeadsPerMonth: number;
  /** `null` = unlimited. */
  maxAlertRules: number | null;
  maxApifyRequestsPerMonth: number;
  maxStorageKb: number;
  dataRetentionDays: number;
  features: PlanFeatures;
}

/**
 * A company's current plan. Falls back to `null` if a company somehow has no
 * subscription row yet — every function below degrades to "no limit
 * enforced" rather than locking a company out over missing billing plumbing.
 */
export async function getCompanyPlan(companyId: string): Promise<CompanyPlan | null> {
  const [row] = await db()
    .select({
      planId: schema.plans.id,
      planName: schema.plans.name,
      maxSeats: schema.plans.maxSeats,
      maxDatasets: schema.plans.maxDatasets,
      maxRawRecordsPerMonth: schema.plans.maxRawRecordsPerMonth,
      maxLeadsPerMonth: schema.plans.maxLeadsPerMonth,
      maxAlertRules: schema.plans.maxAlertRules,
      maxApifyRequestsPerMonth: schema.plans.maxApifyRequestsPerMonth,
      maxStorageKb: schema.plans.maxStorageKb,
      dataRetentionDays: schema.plans.dataRetentionDays,
      features: schema.plans.features,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
    .where(eq(schema.subscriptions.companyId, companyId))
    .limit(1);
  return row ?? null;
}

export class LimitExceededError extends Error {
  constructor(
    readonly metric: "datasets" | "seats",
    readonly limit: number,
  ) {
    super(
      metric === "datasets"
        ? `Dataset limit reached (${limit}). Upgrade your plan to track more datasets.`
        : `Seat limit reached (${limit}). Upgrade your plan to add more teammates.`,
    );
  }
}

/**
 * `datasets`/`seats` are enforced via a live `COUNT(*)`, not `usage_counters`
 * — both are small, infrequent, admin-driven writes (a company has tens of
 * datasets/users, not thousands), so the aggregate-table optimization the
 * monthly metrics below need isn't worth the drift risk here. See
 * docs/saas-database-schema.md.
 */
export async function assertWithinLimit(
  companyId: string,
  metric: "datasets" | "seats",
): Promise<void> {
  const plan = await getCompanyPlan(companyId);
  if (!plan) return; // no subscription row — degrade to unenforced, not locked out

  const limit = metric === "datasets" ? plan.maxDatasets : plan.maxSeats;
  if (limit === null) return; // unlimited on this plan

  const [row] =
    metric === "datasets"
      ? await db()
          .select({ value: count() })
          .from(schema.datasets)
          .where(and(eq(schema.datasets.companyId, companyId), sql`${schema.datasets.status} != 'archived'`))
      : await db().select({ value: count() }).from(schema.users).where(eq(schema.users.companyId, companyId));

  if (row.value >= limit) {
    throw new LimitExceededError(metric, limit);
  }
}

/** Exported for `usage.test.ts` — pure date math, no DB needed to verify it. */
export function currentMonthBounds(referenceDate: Date = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type MonthlyMetric = "leads_this_month" | "raw_records_month" | "apify_requests_month" | "storage_kb";

/** Structurally compatible with both `db()` and a `db().transaction(tx => ...)` callback's `tx`. */
type QueryClient = Pick<Database, "select" | "insert">;

async function currentMonthValue(companyId: string, metric: MonthlyMetric, client: QueryClient = db()): Promise<number> {
  const { start } = currentMonthBounds();
  const [row] = await client
    .select({ value: schema.usageCounters.value })
    .from(schema.usageCounters)
    .where(
      and(
        eq(schema.usageCounters.companyId, companyId),
        eq(schema.usageCounters.metric, metric),
        eq(schema.usageCounters.periodStart, start),
      ),
    )
    .limit(1);
  return row?.value ?? 0;
}

/**
 * `storage_kb` is bucketed monthly in storage (same shape as every other
 * counter here, same unique index, no schema change needed) but represents a
 * *cumulative* quantity — "KB added this month," summed across every month
 * ever recorded, not reset. At most one row per company per month, so this
 * aggregate is cheap regardless of how much data has been ingested.
 */
async function totalStorageKb(companyId: string): Promise<number> {
  const [row] = await db()
    .select({ value: sql<number>`coalesce(sum(${schema.usageCounters.value}), 0)::int` })
    .from(schema.usageCounters)
    .where(and(eq(schema.usageCounters.companyId, companyId), eq(schema.usageCounters.metric, "storage_kb")));
  return row?.value ?? 0;
}

/**
 * Non-throwing — called from inside the sync engine (`syncDataset`), a
 * background/cron context where an uncaught throw would fail the whole run.
 * The caller decides what "over budget" means for that run (skip, log,
 * degrade), same reasoning as every other connector-level guard in this
 * codebase (`RETRYABLE`, `SYNC_MAX_PAGES_PER_RUN`).
 */
export async function isWithinMonthlyBudget(
  companyId: string,
  metric: "rawRecords" | "apifyRequests",
  client: QueryClient = db(),
): Promise<boolean> {
  const plan = await getCompanyPlan(companyId);
  if (!plan) return true; // no subscription row — degrade to unenforced

  const limit = metric === "rawRecords" ? plan.maxRawRecordsPerMonth : plan.maxApifyRequestsPerMonth;
  const dbMetric: MonthlyMetric = metric === "rawRecords" ? "raw_records_month" : "apify_requests_month";
  const used = await currentMonthValue(companyId, dbMetric, client);
  return used < limit;
}

/**
 * Shared by every counter below. A logging/counting failure must never break
 * the real operation it's measuring — same rule `incrementMonthlyLeadUsage`
 * already established, just factored out now that four metrics need it.
 */
async function incrementMonthlyCounter(
  companyId: string,
  metric: MonthlyMetric,
  amount: number,
  client: QueryClient = db(),
): Promise<void> {
  const { start, end } = currentMonthBounds();
  try {
    await client
      .insert(schema.usageCounters)
      .values({ companyId, metric, periodStart: start, periodEnd: end, value: amount })
      .onConflictDoUpdate({
        target: [schema.usageCounters.companyId, schema.usageCounters.metric, schema.usageCounters.periodStart],
        set: { value: sql`${schema.usageCounters.value} + ${amount}`, updatedAt: new Date() },
      });
  } catch (error) {
    log.warn("failed to increment usage counter", { error, companyId, metric });
  }
}

/**
 * Tracked, not enforced — deliberate scope decision. Checking this live would
 * mean a date-ranged `COUNT(*)` on `leads` inside the per-record ingestion
 * loop (`application/leads/identity-resolution.ts`), which runs per new
 * person, potentially thousands of times per sync. Called only when
 * `resolveIdentity` actually creates a new person, never on a merge into an
 * existing one.
 */
export async function incrementMonthlyLeadUsage(companyId: string): Promise<void> {
  await incrementMonthlyCounter(companyId, "leads_this_month", 1);
}

/** Called once per ingested page in `syncDataset`, with that page's item count. */
export async function incrementRawRecordUsage(companyId: string, itemCount: number): Promise<void> {
  if (itemCount <= 0) return;
  await incrementMonthlyCounter(companyId, "raw_records_month", itemCount);
}

/**
 * Called from `apify.connector.ts` alongside its existing `api_requests`
 * audit-log insert (one call per real HTTP request Apify makes), and also
 * from `application/collection/start-scrape-request.ts` as an atomic
 * reservation at admission time (see that file's comment) — the two are
 * additive by design, not a double-count bug: the reservation guarantees a
 * concurrent burst of scrape requests can't all pass the budget check before
 * any of them is accounted for, at the cost of counting every triggered
 * scrape as at least 1 request even before its actual Apify calls land.
 */
export async function incrementApifyRequestUsage(companyId: string, client: QueryClient = db()): Promise<void> {
  await incrementMonthlyCounter(companyId, "apify_requests_month", 1, client);
}

/**
 * Called with newly-*inserted* raw records only (not updates — an
 * `onConflictDoUpdate` overwrite doesn't meaningfully grow storage the way a
 * fresh row does). Only ever grows: nothing decrements this when old rows
 * are pruned or a dataset is deleted yet — see docs/tech-debt.md.
 */
export async function incrementStorageUsage(companyId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  const kb = Math.ceil(bytes / 1024);
  await incrementMonthlyCounter(companyId, "storage_kb", kb);
}

export interface UsageSummary {
  datasets: { used: number; limit: number };
  seats: { used: number; limit: number | null };
  leadsThisMonth: { used: number; limit: number };
  rawRecordsThisMonth: { used: number; limit: number };
  apifyRequestsThisMonth: { used: number; limit: number };
  storageKb: { used: number; limit: number };
  alertRules: { used: number; limit: number | null };
}

/** Backs the usage stat rows on /admin/team and /admin/billing. */
export async function getUsageSummary(companyId: string): Promise<UsageSummary | null> {
  const plan = await getCompanyPlan(companyId);
  if (!plan) return null;

  const [datasetCount] = await db()
    .select({ value: count() })
    .from(schema.datasets)
    .where(and(eq(schema.datasets.companyId, companyId), sql`${schema.datasets.status} != 'archived'`));
  const [seatCount] = await db().select({ value: count() }).from(schema.users).where(eq(schema.users.companyId, companyId));
  const [alertRuleCount] = await db()
    .select({ value: count() })
    .from(schema.alertRules)
    .where(eq(schema.alertRules.companyId, companyId));

  const [leadsThisMonth, rawRecordsThisMonth, apifyRequestsThisMonth, storageKb] = await Promise.all([
    currentMonthValue(companyId, "leads_this_month"),
    currentMonthValue(companyId, "raw_records_month"),
    currentMonthValue(companyId, "apify_requests_month"),
    totalStorageKb(companyId),
  ]);

  return {
    datasets: { used: datasetCount.value, limit: plan.maxDatasets },
    seats: { used: seatCount.value, limit: plan.maxSeats },
    leadsThisMonth: { used: leadsThisMonth, limit: plan.maxLeadsPerMonth },
    rawRecordsThisMonth: { used: rawRecordsThisMonth, limit: plan.maxRawRecordsPerMonth },
    apifyRequestsThisMonth: { used: apifyRequestsThisMonth, limit: plan.maxApifyRequestsPerMonth },
    storageKb: { used: storageKb, limit: plan.maxStorageKb },
    alertRules: { used: alertRuleCount.value, limit: plan.maxAlertRules },
  };
}
