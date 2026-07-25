import { describe, expect, it } from "vitest";
import { computeHealth, isWeekendInBali, nextIntervalSeconds } from "./scheduling";
import { MAX_SYNC_INTERVAL_SECONDS, MIN_SYNC_INTERVAL_SECONDS } from "@/shared/constants";

describe("isWeekendInBali", () => {
  it("treats Saturday in WITA as the weekend", () => {
    // 2026-07-25 is a Saturday.
    expect(isWeekendInBali(new Date("2026-07-25T04:00:00Z"))).toBe(true);
  });

  it("treats Friday evening WITA as the weekend", () => {
    // 11:00Z is 19:00 WITA on Friday 2026-07-24.
    expect(isWeekendInBali(new Date("2026-07-24T11:00:00Z"))).toBe(true);
  });

  it("treats a Tuesday morning as a weekday", () => {
    expect(isWeekendInBali(new Date("2026-07-21T02:00:00Z"))).toBe(false);
  });
});

describe("nextIntervalSeconds", () => {
  const weekday = new Date("2026-07-21T02:00:00Z");

  it("polls harder after a dataset produced new items", () => {
    const busy = nextIntervalSeconds({
      baseIntervalSeconds: 900,
      producedNewItems: true,
      consecutiveFailures: 0,
      now: weekday,
    });
    const quiet = nextIntervalSeconds({
      baseIntervalSeconds: 900,
      producedNewItems: false,
      consecutiveFailures: 0,
      now: weekday,
    });
    expect(busy).toBeLessThan(quiet);
  });

  it("backs off exponentially on repeated failures", () => {
    const once = nextIntervalSeconds({
      baseIntervalSeconds: 900,
      producedNewItems: false,
      consecutiveFailures: 1,
      now: weekday,
    });
    const many = nextIntervalSeconds({
      baseIntervalSeconds: 900,
      producedNewItems: false,
      consecutiveFailures: 4,
      now: weekday,
    });
    expect(many).toBeGreaterThan(once);
  });

  it("stays inside the configured bounds", () => {
    const value = nextIntervalSeconds({
      baseIntervalSeconds: 999_999,
      producedNewItems: false,
      consecutiveFailures: 5,
      now: weekday,
    });
    expect(value).toBeLessThanOrEqual(MAX_SYNC_INTERVAL_SECONDS);
    expect(value).toBeGreaterThanOrEqual(MIN_SYNC_INTERVAL_SECONDS);
  });
});

describe("computeHealth", () => {
  const now = new Date("2026-07-25T12:00:00Z");

  it("flags schema drift above staleness", () => {
    expect(
      computeHealth({
        consecutiveFailures: 0,
        lastSyncedAt: new Date("2026-01-01T00:00:00Z"),
        remoteModifiedAt: new Date("2026-01-01T00:00:00Z"),
        syncIntervalSeconds: 900,
        hasSchemaDrift: true,
        normalizationFailureRate: 0,
        now,
      }).health,
    ).toBe("schema_drift");
  });

  it("reports error after the failure threshold", () => {
    expect(
      computeHealth({
        consecutiveFailures: 3,
        lastSyncedAt: now,
        remoteModifiedAt: now,
        syncIntervalSeconds: 900,
        hasSchemaDrift: false,
        normalizationFailureRate: 0,
        now,
      }).health,
    ).toBe("error");
  });

  it("reports stale when upstream stopped producing", () => {
    expect(
      computeHealth({
        consecutiveFailures: 0,
        lastSyncedAt: now,
        remoteModifiedAt: new Date("2026-07-01T00:00:00Z"),
        syncIntervalSeconds: 900,
        hasSchemaDrift: false,
        normalizationFailureRate: 0,
        now,
      }).health,
    ).toBe("stale");
  });

  it("degrades when normalization is failing", () => {
    expect(
      computeHealth({
        consecutiveFailures: 0,
        lastSyncedAt: now,
        remoteModifiedAt: now,
        syncIntervalSeconds: 900,
        hasSchemaDrift: false,
        normalizationFailureRate: 0.2,
        now,
      }).health,
    ).toBe("degraded");
  });

  it("is healthy on a normal cycle", () => {
    expect(
      computeHealth({
        consecutiveFailures: 0,
        lastSyncedAt: now,
        remoteModifiedAt: now,
        syncIntervalSeconds: 900,
        hasSchemaDrift: false,
        normalizationFailureRate: 0,
        now,
      }).health,
    ).toBe("healthy");
  });
});
