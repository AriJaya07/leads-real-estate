/**
 * Port the FX refresh job talks to. Same reason `domain/sync/ports.ts` exists for
 * connectors: the refresh job must not be existentially coupled to one rate
 * provider, and a pure interface here is what a fake implementation in tests
 * stands in for without any network call.
 */

export interface FxRateSnapshot {
  currency: string;
  /** USD value of one unit of `currency` — matches `fx_rates.usd_per_unit`. */
  usdPerUnit: number;
}

export interface FxRateProvider {
  fetchRates(currencies: string[]): Promise<FxRateSnapshot[]>;
}
