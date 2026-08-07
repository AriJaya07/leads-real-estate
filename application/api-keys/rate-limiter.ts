import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getCompanyPlan } from "@/application/billing/usage";
import { evaluateRateLimit, type RateLimitDecision } from "@/domain/api-keys/rate-limit";
import { API_KEY_RATE_LIMIT_BURST_WINDOW_SECONDS } from "@/shared/constants";

/**
 * Fixed-window counting: one row per (key, window size, window's start
 * timestamp), incremented atomically via the same `onConflictDoUpdate`
 * idiom `application/billing/usage.ts`'s monthly counters use, just with
 * second-granularity windows. `windowStart` is floored to a multiple of
 * `windowSeconds` so every request in the same window lands on the same row.
 */
async function incrementWindow(apiKeyId: string, windowSeconds: number): Promise<number> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);

  const [row] = await db()
    .insert(schema.apiKeyRateCounters)
    .values({ apiKeyId, windowSeconds, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [
        schema.apiKeyRateCounters.apiKeyId,
        schema.apiKeyRateCounters.windowSeconds,
        schema.apiKeyRateCounters.windowStart,
      ],
      set: { count: sql`${schema.apiKeyRateCounters.count} + 1` },
    })
    .returning({ count: schema.apiKeyRateCounters.count });

  return row.count;
}

/**
 * Called once per authenticated `app/api/v1/*` request, after
 * `authenticateApiKey`. `getCompanyPlan` already degrades to "no subscription
 * row → unenforced" on its own, so a company with no plan record simply never
 * gets rate limited here — same posture as every other plan-gated check in
 * this codebase (`isWithinMonthlyBudget`, `assertWithinLimit`).
 */
export async function checkApiRateLimit(apiKeyId: string, companyId: string): Promise<RateLimitDecision> {
  const plan = await getCompanyPlan(companyId);

  const windows = [
    { seconds: 60, limit: plan?.apiRateLimitPerMinute ?? null },
    { seconds: API_KEY_RATE_LIMIT_BURST_WINDOW_SECONDS, limit: plan?.apiRateLimitBurst ?? null },
  ];

  const counts = await Promise.all(
    windows.map(async (window) => ({
      windowSeconds: window.seconds,
      // Unlimited windows aren't worth a write — skip the counter entirely.
      count: window.limit === null ? 0 : await incrementWindow(apiKeyId, window.seconds),
      limit: window.limit,
    })),
  );

  return evaluateRateLimit(counts);
}
