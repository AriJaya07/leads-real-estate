import { describe, expect, it } from "vitest";
import { describePredicate, evaluatePredicate, parseDurationMs } from "./predicate";

const NOW = Date.parse("2026-07-25T12:00:00Z");

const PRIORITY_BUYER = {
  all: [
    { field: "intent", op: "eq" as const, value: "buyer" },
    { field: "intentScore", op: "gte" as const, value: 60 },
    { field: "isSpam", op: "eq" as const, value: false },
    { field: "postedAt", op: "within" as const, value: "P3D" },
    {
      any: [
        { field: "propertyTypes", op: "intersects" as const, value: ["villa", "land"] },
        { field: "budgetMin", op: "gte" as const, value: 50000 },
      ],
    },
  ],
};

describe("evaluatePredicate", () => {
  it("matches the seeded priority-buyer rule", () => {
    expect(
      evaluatePredicate(
        PRIORITY_BUYER,
        {
          intent: "buyer",
          intentScore: 72,
          isSpam: false,
          postedAt: "2026-07-24T09:00:00Z",
          propertyTypes: ["villa"],
          budgetMin: null,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects a lead below the score threshold", () => {
    expect(
      evaluatePredicate(
        PRIORITY_BUYER,
        {
          intent: "buyer",
          intentScore: 40,
          isSpam: false,
          postedAt: "2026-07-24T09:00:00Z",
          propertyTypes: ["villa"],
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects a stale post even when everything else matches", () => {
    expect(
      evaluatePredicate(
        PRIORITY_BUYER,
        {
          intent: "buyer",
          intentScore: 90,
          isSpam: false,
          postedAt: "2026-06-01T09:00:00Z",
          propertyTypes: ["villa"],
        },
        NOW,
      ),
    ).toBe(false);
  });

  /** A property type nobody has seen before still alerts if the budget qualifies. */
  it("satisfies the any-branch via budget when the type list misses", () => {
    expect(
      evaluatePredicate(
        PRIORITY_BUYER,
        {
          intent: "buyer",
          intentScore: 65,
          isSpam: false,
          postedAt: "2026-07-25T09:00:00Z",
          propertyTypes: ["penthouse"],
          budgetMin: 300000,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("fails the any-branch when neither the type nor the budget qualifies", () => {
    expect(
      evaluatePredicate(
        PRIORITY_BUYER,
        {
          intent: "buyer",
          intentScore: 65,
          isSpam: false,
          postedAt: "2026-07-25T09:00:00Z",
          propertyTypes: ["penthouse"],
          budgetMin: 1000,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("handles not, exists and case-insensitive intersects", () => {
    expect(evaluatePredicate({ not: { field: "a", op: "eq", value: 1 } }, { a: 2 })).toBe(true);
    expect(evaluatePredicate({ field: "a", op: "exists" }, { a: "" })).toBe(false);
    expect(
      evaluatePredicate({ field: "t", op: "intersects", value: ["Villa"] }, { t: ["villa"] }),
    ).toBe(true);
  });

  it("returns false rather than throwing on a missing field", () => {
    expect(evaluatePredicate({ field: "nope.deep", op: "gte", value: 1 }, {})).toBe(false);
  });
});

describe("parseDurationMs", () => {
  it("parses the ISO-8601 subset", () => {
    expect(parseDurationMs("PT6H")).toBe(6 * 3_600_000);
    expect(parseDurationMs("P3D")).toBe(3 * 86_400_000);
    expect(parseDurationMs("PT30M")).toBe(30 * 60_000);
    expect(parseDurationMs("nonsense")).toBeNull();
  });
});

describe("describePredicate", () => {
  it("renders prose for the admin UI", () => {
    expect(describePredicate(PRIORITY_BUYER)).toContain("intent eq buyer");
  });
});
