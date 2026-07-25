import { describe, expect, it } from "vitest";
import {
  ALREADY_WORKED_PENALTY,
  CONTACTABLE_BONUS,
  RECENCY_HALF_LIFE_HOURS,
  priorityBaseScore,
  priorityScore,
  recencyMultiplier,
} from "./ranking";

const HOUR = 3_600_000;

describe("recencyMultiplier", () => {
  it("is 1 at the moment of posting", () => {
    const now = Date.now();
    expect(recencyMultiplier(new Date(now), now)).toBeCloseTo(1);
  });

  it("halves after exactly one half-life", () => {
    const now = Date.now();
    const postedAt = new Date(now - RECENCY_HALF_LIFE_HOURS * HOUR);
    expect(recencyMultiplier(postedAt, now)).toBeCloseTo(0.5, 5);
  });

  it("treats an unparseable date as effectively old rather than throwing", () => {
    expect(recencyMultiplier("not-a-date")).toBe(0.25);
  });
});

describe("priorityBaseScore", () => {
  it("weights intent over quality for a buyer", () => {
    const highIntent = priorityBaseScore({ intent: "buyer", intentScore: 100, qualityScore: 0 });
    const highQuality = priorityBaseScore({ intent: "buyer", intentScore: 0, qualityScore: 100 });
    expect(highIntent).toBeGreaterThan(highQuality);
  });

  it("caps non-buyer intent well below an equivalent buyer score", () => {
    const seller = priorityBaseScore({ intent: "seller", intentScore: 100, qualityScore: 100 });
    const buyer = priorityBaseScore({ intent: "buyer", intentScore: 100, qualityScore: 100 });
    expect(seller).toBeLessThan(buyer);
  });
});

describe("priorityScore", () => {
  const now = Date.now();

  it("ranks a fresh, contactable buyer above an equal-score stale one", () => {
    const fresh = priorityScore(
      { intent: "buyer", intentScore: 80, qualityScore: 60, postedAt: new Date(now), hasContact: true },
      now,
    );
    const stale = priorityScore(
      {
        intent: "buyer",
        intentScore: 80,
        qualityScore: 60,
        postedAt: new Date(now - 3 * 24 * HOUR),
        hasContact: true,
      },
      now,
    );
    expect(fresh).toBeGreaterThan(stale);
  });

  it("applies the contactable bonus only for buyers with contact info", () => {
    const withContact = priorityScore(
      { intent: "buyer", intentScore: 80, qualityScore: 60, postedAt: new Date(now), hasContact: true },
      now,
    );
    const withoutContact = priorityScore(
      { intent: "buyer", intentScore: 80, qualityScore: 60, postedAt: new Date(now), hasContact: false },
      now,
    );
    expect(withContact).toBe(Math.round(withoutContact * CONTACTABLE_BONUS));
  });

  it("applies the already-worked penalty once a buyer lead has moved past contacted", () => {
    const untouched = priorityScore(
      { intent: "buyer", intentScore: 80, qualityScore: 60, postedAt: new Date(now), hasContact: false, status: "new" },
      now,
    );
    const qualified = priorityScore(
      {
        intent: "buyer",
        intentScore: 80,
        qualityScore: 60,
        postedAt: new Date(now),
        hasContact: false,
        status: "qualified",
      },
      now,
    );
    expect(qualified).toBe(Math.round(untouched * ALREADY_WORKED_PENALTY));
  });

  it("never applies the contactable/already-worked multipliers to non-buyer intent", () => {
    const seller = priorityScore(
      {
        intent: "seller",
        intentScore: 80,
        qualityScore: 60,
        postedAt: new Date(now),
        hasContact: true,
        status: "converted",
      },
      now,
    );
    expect(seller).toBe(Math.round(80 * 0.2));
  });
});
