import { describe, expect, it } from "vitest";
import { EMPTY_ROLLUP, rollupPersonScores, type AppearanceForRollup } from "./lead-rollup";

function appearance(overrides: Partial<AppearanceForRollup> = {}): AppearanceForRollup {
  return {
    intent: "other",
    intentScore: 0,
    investorScore: 0,
    brokerScore: 0,
    recordKind: "content_post",
    propertyTypes: [],
    locations: [],
    hasContact: false,
    postedAt: new Date("2026-01-01T00:00:00Z"),
    scoreReasons: [],
    ...overrides,
  };
}

describe("rollupPersonScores", () => {
  it("returns EMPTY_ROLLUP for a person with no appearances", () => {
    expect(rollupPersonScores([])).toEqual(EMPTY_ROLLUP);
  });

  it("classifies leadType buyer from a single strong buyer appearance", () => {
    const rollup = rollupPersonScores([
      appearance({
        intent: "buyer",
        intentScore: 80,
        scoreReasons: [{ code: "buyer_phrase", label: "Buy-intent phrase", weight: 30 }],
      }),
    ]);
    expect(rollup.leadType).toBe("buyer");
    expect(rollup.buyerScore).toBeGreaterThan(0);
    expect(rollup.sellerScore).toBe(0);
  });

  it("applies diminishing returns across multiple corroborating buyer appearances", () => {
    const two = rollupPersonScores([
      appearance({ intent: "buyer", intentScore: 50 }),
      appearance({ intent: "buyer", intentScore: 50 }),
    ]);
    const one = rollupPersonScores([appearance({ intent: "buyer", intentScore: 50 })]);
    expect(two.buyerScore).toBeGreaterThan(one.buyerScore);
    expect(two.buyerScore).toBeLessThan(one.buyerScore * 2);
  });

  it("picks the strongest-scoring type between mixed buyer and seller appearances", () => {
    const rollup = rollupPersonScores([
      appearance({ intent: "buyer", intentScore: 20 }),
      appearance({ intent: "seller", intentScore: 90 }),
    ]);
    expect(rollup.leadType).toBe("seller");
  });

  it("rolls up investorScore independent of the appearance's primary intent", () => {
    const rollup = rollupPersonScores([
      appearance({ intent: "buyer", intentScore: 40, investorScore: 60 }),
    ]);
    expect(rollup.investorScore).toBeGreaterThan(0);
  });

  it("classifies leadType unknown when every signal is below the floor", () => {
    const rollup = rollupPersonScores([appearance({ intent: "other", intentScore: 5 })]);
    expect(rollup.leadType).toBe("unknown");
  });

  it("increases confidenceScore with more corroborating appearances", () => {
    const single = rollupPersonScores([appearance({ intent: "buyer", intentScore: 70 })]);
    const many = rollupPersonScores([
      appearance({ intent: "buyer", intentScore: 70, postedAt: new Date("2026-01-01") }),
      appearance({ intent: "buyer", intentScore: 65, postedAt: new Date("2026-01-05") }),
      appearance({ intent: "buyer", intentScore: 60, postedAt: new Date("2026-01-10") }),
    ]);
    expect(many.confidenceScore).toBeGreaterThan(single.confidenceScore);
  });

  it("unions propertyTypes/locations across appearances without duplicates", () => {
    const rollup = rollupPersonScores([
      appearance({ propertyTypes: ["villa"], locations: ["canggu"] }),
      appearance({ propertyTypes: ["villa", "land"], locations: ["ubud"] }),
    ]);
    expect(rollup.propertyTypes.sort()).toEqual(["land", "villa"]);
    expect(rollup.locations.sort()).toEqual(["canggu", "ubud"]);
  });

  it("takes the max postedAt as latestAppearanceAt", () => {
    const rollup = rollupPersonScores([
      appearance({ postedAt: new Date("2026-01-01") }),
      appearance({ postedAt: new Date("2026-01-15") }),
      appearance({ postedAt: new Date("2026-01-08") }),
    ]);
    expect(rollup.latestAppearanceAt).toEqual(new Date("2026-01-15"));
  });

  it("counts appearanceCount as the number of appearances passed in", () => {
    const rollup = rollupPersonScores([appearance(), appearance(), appearance()]);
    expect(rollup.appearanceCount).toBe(3);
  });

  it("produces a non-empty, leadType-referencing explanation", () => {
    const rollup = rollupPersonScores([
      appearance({
        intent: "buyer",
        intentScore: 80,
        scoreReasons: [{ code: "buyer_phrase", label: 'Buy-intent phrase "looking to buy"', weight: 30 }],
      }),
    ]);
    expect(rollup.aiExplanation).toContain("buyer");
    expect(rollup.aiExplanation.length).toBeGreaterThan(0);
  });

  it("never lets a negative-weight (spam/mixed-signal) reason surface as the 'strongest signal'", () => {
    const rollup = rollupPersonScores([
      appearance({
        intent: "buyer",
        intentScore: 60,
        scoreReasons: [
          { code: "mixed_signals", label: "Also contains listing language", weight: -20 },
          { code: "buyer_phrase", label: "Buy-intent phrase", weight: 30 },
        ],
      }),
    ]);
    expect(rollup.aiExplanation).toContain("Buy-intent phrase");
    expect(rollup.aiExplanation).not.toContain("Also contains listing language");
  });
});
