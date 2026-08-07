import { describe, expect, it } from "vitest";
import { evaluateRateLimit } from "./rate-limit";

describe("evaluateRateLimit", () => {
  it("allows a request below every window's limit", () => {
    const result = evaluateRateLimit([
      { windowSeconds: 60, count: 10, limit: 60 },
      { windowSeconds: 10, count: 2, limit: 120 },
    ]);
    expect(result).toEqual({ allowed: true, retryAfterSeconds: null });
  });

  it("blocks once a single window is exceeded", () => {
    const result = evaluateRateLimit([{ windowSeconds: 60, count: 61, limit: 60 }]);
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("allows a request exactly at the limit", () => {
    const result = evaluateRateLimit([{ windowSeconds: 60, count: 60, limit: 60 }]);
    expect(result.allowed).toBe(true);
  });

  it("treats a null limit as unlimited regardless of count", () => {
    const result = evaluateRateLimit([{ windowSeconds: 60, count: 999_999, limit: null }]);
    expect(result).toEqual({ allowed: true, retryAfterSeconds: null });
  });

  it("reports the longest wait when multiple windows are exceeded", () => {
    const result = evaluateRateLimit([
      { windowSeconds: 10, count: 121, limit: 120 },
      { windowSeconds: 60, count: 61, limit: 60 },
    ]);
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });
});
