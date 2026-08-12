import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

export interface PlanDistributionRow {
  planId: string;
  planName: string;
  monthlyPriceUsd: number | null;
  activeSubscriptionCount: number;
}

export interface PlatformBillingOverview {
  planDistribution: PlanDistributionRow[];
  /** Sum of `monthlyPriceUsd * count` across active/trialing subscriptions with a priced plan (Enterprise's null price excluded, not counted as $0). */
  estimatedMrrUsd: number;
}

/**
 * Plan mix and estimated recurring revenue across every tenant — billing
 * metadata only (`plans`/`subscriptions`), same boundary as the rest of
 * `application/platform/`. Not a Stripe reconciliation view — see
 * `docs/saas-platform-architecture.md`'s note that real Stripe payment
 * collection isn't built yet; this reads what this app's own DB believes
 * the subscription state is.
 */
export async function getPlatformBillingOverview(): Promise<PlatformBillingOverview> {
  const rows = await db()
    .select({
      planId: schema.plans.id,
      planName: schema.plans.name,
      monthlyPriceUsd: schema.plans.monthlyPriceUsd,
      activeSubscriptionCount: sql<number>`count(${schema.subscriptions.id}) filter (where ${schema.subscriptions.status} in ('active', 'trialing'))::int`,
    })
    .from(schema.plans)
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.planId, schema.plans.id))
    .groupBy(schema.plans.id, schema.plans.name, schema.plans.monthlyPriceUsd)
    .orderBy(schema.plans.monthlyPriceUsd);

  const estimatedMrrUsd = rows.reduce(
    (sum, row) => sum + (row.monthlyPriceUsd ?? 0) * row.activeSubscriptionCount,
    0,
  );

  return { planDistribution: rows, estimatedMrrUsd };
}
