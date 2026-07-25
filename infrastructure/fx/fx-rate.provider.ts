import "server-only";
import type { FxRateProvider, FxRateSnapshot } from "@/domain/fx/ports";

const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1";

/**
 * ECB reference rates via frankfurter.dev — free, no API key, no rate-limit
 * hassle for a once-a-day refresh. Covers the currencies this platform actually
 * sees (USD, IDR, EUR, AUD) plus the ~30 others ECB publishes.
 *
 * The API returns "units of X per 1 USD"; `fx_rates.usd_per_unit` is the inverse
 * (USD value of one unit of X), matching what `application/leads/process-records.ts`
 * multiplies a budget by — hence the `1 / rate` below.
 */
export const frankfurterFxProvider: FxRateProvider = {
  async fetchRates(currencies: string[]): Promise<FxRateSnapshot[]> {
    const targets = currencies.filter((currency) => currency !== "USD");
    const snapshots: FxRateSnapshot[] = currencies.includes("USD")
      ? [{ currency: "USD", usdPerUnit: 1 }]
      : [];
    if (targets.length === 0) return snapshots;

    const query = new URLSearchParams({ from: "USD", to: targets.join(",") });
    const response = await fetch(`${FRANKFURTER_BASE_URL}/latest?${query}`, {
      // This feeds a once-daily refresh into the database; caching the upstream
      // read would only serve a stale rate on a cache hit.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`FX rate request failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as { rates: Record<string, number> };
    for (const [currency, unitsPerUsd] of Object.entries(body.rates)) {
      if (unitsPerUsd > 0) snapshots.push({ currency, usdPerUnit: 1 / unitsPerUsd });
    }

    return snapshots;
  },
};
