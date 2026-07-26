import "server-only";
import { db, schema } from "@/infrastructure/db/client";
import { frankfurterFxProvider } from "@/infrastructure/fx/fx-rate.provider";
import { createLogger } from "@/infrastructure/observability/logger";
import type { FxRateProvider } from "@/domain/fx/ports";

const log = createLogger("fx-refresh");

export interface FxRefreshResult {
  updated: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Refreshes every currency already tracked in `fx_rates` from a live source. A
 * fresh install with no rows yet falls back to the four currencies the seed
 * script populates (see `docs/tech-debt.md` — this replaces the "seeded once,
 * never updated" gap).
 *
 * Any failure — network, upstream shape change, missing currency — leaves the
 * existing rows untouched rather than throwing. A stale rate is a minor budget-
 * filtering accuracy issue; a broken refresh must never be allowed to break
 * ingestion or crash whatever triggered it, matching the same
 * degrade-gracefully rule every other adapter in this codebase follows.
 *
 * Nothing calls this today — it used to run from `/api/cron/fx`, removed along
 * with the rest of the cron routes in favour of external (n8n) scheduling. See
 * `docs/tech-debt.md`'s "no scheduled trigger" entry.
 */
export async function refreshFxRates(
  provider: FxRateProvider = frankfurterFxProvider,
): Promise<FxRefreshResult> {
  const tracked = await db().select({ currency: schema.fxRates.currency }).from(schema.fxRates);
  const currencies = tracked.length > 0 ? tracked.map((row) => row.currency) : ["USD", "IDR", "EUR", "AUD"];

  try {
    const rates = await provider.fetchRates(currencies);
    if (rates.length === 0) {
      log.warn("provider returned no rates; leaving existing rows untouched", { currencies });
      return { updated: 0, skipped: true, reason: "provider returned no rates" };
    }

    for (const rate of rates) {
      await db()
        .insert(schema.fxRates)
        .values({ currency: rate.currency, usdPerUnit: rate.usdPerUnit })
        .onConflictDoUpdate({
          target: schema.fxRates.currency,
          set: { usdPerUnit: rate.usdPerUnit, updatedAt: new Date() },
        });
    }

    log.info("refreshed", { count: rates.length, currencies: rates.map((r) => r.currency) });
    return { updated: rates.length, skipped: false };
  } catch (error) {
    log.error("refresh failed; keeping existing rates", { error });
    return {
      updated: 0,
      skipped: true,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
