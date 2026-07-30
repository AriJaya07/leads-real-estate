import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

export interface RevenueTrendPoint {
  date: string;
  revenueUsd: number;
}

export interface RevenueSummary {
  totalRevenueUsd: number;
  closedDealCount: number;
  avgDealValueUsd: number | null;
  revenueLast30Days: number;
  dealsLast30Days: number;
  /** The current plan's list price — the cost side of the ROI comparison. `null` with no active subscription. */
  monthlyPlanCostUsd: number | null;
  /** `revenueLast30Days / monthlyPlanCostUsd` — "how many times over the subscription paid for itself this month." `null` when the plan cost is unknown or 0 (nothing sane to divide by). */
  roiMultiple: number | null;
  trend: RevenueTrendPoint[];
}

/**
 * Revenue and ROI, built entirely on `lead_states.dealValueUsd` — a human-
 * entered actual, never the lead's own *stated asking* budget
 * (`leads.budgetUsdMin/Max`). Mixing those would let a wishful buyer's post
 * ("looking to spend $2M") masquerade as recognized revenue; keeping them
 * separate is what "ensure all calculations are accurate" requires here.
 */
export async function getRevenueSummary(companyId: string, days = 30): Promise<RevenueSummary> {
  const [totals] = await db()
    .select({
      totalRevenueUsd: sql<number>`coalesce(sum(${schema.leadStates.dealValueUsd}) FILTER (WHERE ${schema.leadStates.status} = 'closed'), 0)::int`,
      closedDealCount: sql<number>`count(*) FILTER (WHERE ${schema.leadStates.status} = 'closed')::int`,
      revenueRecent: sql<number>`coalesce(sum(${schema.leadStates.dealValueUsd}) FILTER (
        WHERE ${schema.leadStates.status} = 'closed' AND ${schema.leadStates.dealClosedAt} > now() - (${days} || ' days')::interval
      ), 0)::int`,
      dealsRecent: sql<number>`count(*) FILTER (
        WHERE ${schema.leadStates.status} = 'closed' AND ${schema.leadStates.dealClosedAt} > now() - (${days} || ' days')::interval
      )::int`,
    })
    .from(schema.leadStates)
    .where(eq(schema.leadStates.companyId, companyId));

  const trendRows = await db()
    .select({
      date: sql<string>`to_char(date_trunc('day', ${schema.leadStates.dealClosedAt}), 'YYYY-MM-DD')`,
      revenueUsd: sql<number>`coalesce(sum(${schema.leadStates.dealValueUsd}), 0)::int`,
    })
    .from(schema.leadStates)
    .where(
      and(
        eq(schema.leadStates.companyId, companyId),
        eq(schema.leadStates.status, "closed"),
        sql`${schema.leadStates.dealClosedAt} > now() - (${days} || ' days')::interval`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${schema.leadStates.dealClosedAt})`)
    .orderBy(sql`date_trunc('day', ${schema.leadStates.dealClosedAt})`);

  const byDate = new Map(trendRows.map((row) => [row.date, row.revenueUsd]));
  const trend: RevenueTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    trend.push({ date, revenueUsd: byDate.get(date) ?? 0 });
  }

  const [plan] = await db()
    .select({ monthlyPriceUsd: schema.plans.monthlyPriceUsd })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
    .where(eq(schema.subscriptions.companyId, companyId))
    .limit(1);
  const monthlyPlanCostUsd = plan?.monthlyPriceUsd ?? null;

  return {
    totalRevenueUsd: totals.totalRevenueUsd,
    closedDealCount: totals.closedDealCount,
    avgDealValueUsd:
      totals.closedDealCount === 0 ? null : Math.round(totals.totalRevenueUsd / totals.closedDealCount),
    revenueLast30Days: totals.revenueRecent,
    dealsLast30Days: totals.dealsRecent,
    monthlyPlanCostUsd,
    roiMultiple: monthlyPlanCostUsd && monthlyPlanCostUsd > 0 ? totals.revenueRecent / monthlyPlanCostUsd : null,
    trend,
  };
}
