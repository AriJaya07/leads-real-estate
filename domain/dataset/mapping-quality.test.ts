import { describe, expect, it } from "vitest";
import { assessMappingQuality } from "./mapping-quality";

describe("assessMappingQuality", () => {
  it("skips the check below the minimum sample size, even at 100% spam", () => {
    const result = assessMappingQuality({ total: 3, spam: 3, emptyBody: 0 });
    expect(result.suspect).toBe(false);
  });

  it("flags a mapping whose first batch is mostly spam", () => {
    const result = assessMappingQuality({ total: 10, spam: 7, emptyBody: 0 });
    expect(result.suspect).toBe(true);
    expect(result.reason).toMatch(/70%/);
    expect(result.reason).toMatch(/spam/);
  });

  it("flags a mapping whose first batch is mostly empty body", () => {
    const result = assessMappingQuality({ total: 10, spam: 0, emptyBody: 6 });
    expect(result.suspect).toBe(true);
    expect(result.reason).toMatch(/60%/);
    expect(result.reason).toMatch(/no body text/);
  });

  it("does not flag a healthy first batch", () => {
    const result = assessMappingQuality({ total: 20, spam: 2, emptyBody: 1 });
    expect(result.suspect).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("is exactly at the boundary safely — right at the threshold does not flag", () => {
    // 60% spam is the threshold itself; only *above* it should flag.
    const result = assessMappingQuality({ total: 10, spam: 6, emptyBody: 0 });
    expect(result.suspect).toBe(false);
  });

  it("does not flag an engagement_like profile for having no body — that's expected, not a mapping error", () => {
    const result = assessMappingQuality({
      total: 10,
      spam: 0,
      emptyBody: 10,
      recordKind: "engagement_like",
    });
    expect(result.suspect).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("still flags an engagement_comment profile for a genuinely high spam rate", () => {
    const result = assessMappingQuality({
      total: 10,
      spam: 8,
      emptyBody: 10,
      recordKind: "engagement_comment",
    });
    expect(result.suspect).toBe(true);
    expect(result.reason).toMatch(/spam/);
  });
});
