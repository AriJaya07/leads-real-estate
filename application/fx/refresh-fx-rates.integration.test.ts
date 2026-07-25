import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { refreshFxRates } from "./refresh-fx-rates";
import { resetDb } from "@/test/integration/db-helpers";
import type { FxRateProvider, FxRateSnapshot } from "@/domain/fx/ports";

function fakeProvider(rates: FxRateSnapshot[] | (() => Promise<FxRateSnapshot[]>)): FxRateProvider {
  return {
    async fetchRates() {
      if (typeof rates === "function") return rates();
      return rates;
    },
  };
}

describe("refreshFxRates", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("upserts a fresh rate for every currently-tracked currency", async () => {
    await db()
      .insert(schema.fxRates)
      .values([
        { currency: "USD", usdPerUnit: 1 },
        { currency: "IDR", usdPerUnit: 0.000061 },
      ]);

    const result = await refreshFxRates(
      fakeProvider([
        { currency: "USD", usdPerUnit: 1 },
        { currency: "IDR", usdPerUnit: 0.0000558 },
      ]),
    );

    expect(result).toEqual({ updated: 2, skipped: false });

    const [idr] = await db().select().from(schema.fxRates).where(eq(schema.fxRates.currency, "IDR"));
    expect(idr.usdPerUnit).toBeCloseTo(0.0000558, 6);
  });

  it("falls back to the four seed currencies when fx_rates is empty", async () => {
    const result = await refreshFxRates(
      fakeProvider([
        { currency: "USD", usdPerUnit: 1 },
        { currency: "IDR", usdPerUnit: 0.0000558 },
        { currency: "EUR", usdPerUnit: 1.09 },
        { currency: "AUD", usdPerUnit: 0.65 },
      ]),
    );

    expect(result.updated).toBe(4);
    const rows = await db().select().from(schema.fxRates);
    expect(rows).toHaveLength(4);
  });

  it("leaves existing rates untouched when the provider fails", async () => {
    await db().insert(schema.fxRates).values({ currency: "USD", usdPerUnit: 1 });

    const failing: FxRateProvider = {
      async fetchRates() {
        throw new Error("upstream unreachable");
      },
    };

    const result = await refreshFxRates(failing);

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("upstream unreachable");

    const rows = await db().select().from(schema.fxRates);
    expect(rows).toHaveLength(1);
    expect(rows[0].usdPerUnit).toBe(1);
  });

  it("does not throw when the provider returns no rates", async () => {
    const result = await refreshFxRates(fakeProvider([]));
    expect(result).toEqual({ updated: 0, skipped: true, reason: "provider returned no rates" });
  });
});
