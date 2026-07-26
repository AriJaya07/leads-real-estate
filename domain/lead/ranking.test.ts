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
  it("is 1 at the moment of the latest appearance", () => {
    const now = Date.now();
    expect(recencyMultiplier(new Date(now), now)).toBeCloseTo(1);
  });

  it("halves after exactly one half-life", () => {
    const now = Date.now();
    const latestAppearanceAt = new Date(now - RECENCY_HALF_LIFE_HOURS * HOUR);
    expect(recencyMultiplier(latestAppearanceAt, now)).toBeCloseTo(0.5, 5);
  });

  it("treats an unparseable date as effectively old rather than throwing", () => {
    expect(recencyMultiplier("not-a-date")).toBe(0.25);
  });

  it("treats a null latestAppearanceAt (no appearances) as effectively old", () => {
    expect(recencyMultiplier(null)).toBe(0.25);
  });
});

describe("priorityBaseScore", () => {
  it("weights buyer score over confidence for a buyer", () => {
    const highBuyer = priorityBaseScore({
      leadType: "buyer",
      buyerScore: 100,
      sellerScore: 0,
      investorScore: 0,
      confidenceScore: 0,
    });
    const highConfidence = priorityBaseScore({
      leadType: "buyer",
      buyerScore: 0,
      sellerScore: 0,
      investorScore: 0,
      confidenceScore: 100,
    });
    expect(highBuyer).toBeGreaterThan(highConfidence);
  });

  it("caps non-buyer leadType well below an equivalent buyer score", () => {
    const seller = priorityBaseScore({
      leadType: "seller",
      buyerScore: 0,
      sellerScore: 100,
      investorScore: 0,
      confidenceScore: 100,
    });
    const buyer = priorityBaseScore({
      leadType: "buyer",
      buyerScore: 100,
      sellerScore: 0,
      investorScore: 0,
      confidenceScore: 100,
    });
    expect(seller).toBeLessThan(buyer);
  });

  it("gives agent/broker/unknown leadType no ranking signal yet", () => {
    const agent = priorityBaseScore({
      leadType: "agent",
      buyerScore: 100,
      sellerScore: 100,
      investorScore: 100,
      confidenceScore: 100,
    });
    expect(agent).toBe(0);
  });
});

describe("priorityScore", () => {
  const now = Date.now();

  it("ranks a fresh, contactable buyer above an equal-score stale one", () => {
    const fresh = priorityScore(
      {
        leadType: "buyer",
        buyerScore: 80,
        sellerScore: 0,
        investorScore: 0,
        confidenceScore: 60,
        latestAppearanceAt: new Date(now),
        hasContact: true,
      },
      now,
    );
    const stale = priorityScore(
      {
        leadType: "buyer",
        buyerScore: 80,
        sellerScore: 0,
        investorScore: 0,
        confidenceScore: 60,
        latestAppearanceAt: new Date(now - 3 * 24 * HOUR),
        hasContact: true,
      },
      now,
    );
    expect(fresh).toBeGreaterThan(stale);
  });

  it("applies the contactable bonus only for buyers with contact info", () => {
    const withContact = priorityScore(
      {
        leadType: "buyer",
        buyerScore: 80,
        sellerScore: 0,
        investorScore: 0,
        confidenceScore: 60,
        latestAppearanceAt: new Date(now),
        hasContact: true,
      },
      now,
    );
    const withoutContact = priorityScore(
      {
        leadType: "buyer",
        buyerScore: 80,
        sellerScore: 0,
        investorScore: 0,
        confidenceScore: 60,
        latestAppearanceAt: new Date(now),
        hasContact: false,
      },
      now,
    );
    expect(withContact).toBe(Math.round(withoutContact * CONTACTABLE_BONUS));
  });

  it("applies the already-worked penalty once a buyer lead has moved past contacted", () => {
    const untouched = priorityScore(
      {
        leadType: "buyer",
        buyerScore: 80,
        sellerScore: 0,
        investorScore: 0,
        confidenceScore: 60,
        latestAppearanceAt: new Date(now),
        hasContact: false,
        status: "new",
      },
      now,
    );
    const qualified = priorityScore(
      {
        leadType: "buyer",
        buyerScore: 80,
        sellerScore: 0,
        investorScore: 0,
        confidenceScore: 60,
        latestAppearanceAt: new Date(now),
        hasContact: false,
        status: "qualified",
      },
      now,
    );
    expect(qualified).toBe(Math.round(untouched * ALREADY_WORKED_PENALTY));
  });

  it("never applies the contactable/already-worked multipliers to non-buyer leadType", () => {
    const seller = priorityScore(
      {
        leadType: "seller",
        buyerScore: 0,
        sellerScore: 80,
        investorScore: 0,
        confidenceScore: 60,
        latestAppearanceAt: new Date(now),
        hasContact: true,
        status: "closed",
      },
      now,
    );
    expect(seller).toBe(Math.round(80 * 0.2));
  });
});
