import { describe, expect, it } from "vitest";
import { isSessionRevoked } from "./session-version";

describe("isSessionRevoked", () => {
  it("is not revoked when the token's version matches the current version", () => {
    expect(isSessionRevoked(1, 1)).toBe(false);
    expect(isSessionRevoked(7, 7)).toBe(false);
  });

  it("is revoked when the current version has moved past the token's version", () => {
    expect(isSessionRevoked(1, 2)).toBe(true);
  });

  it("is revoked even if the token somehow carries a newer version than current", () => {
    // Shouldn't happen in practice, but a mismatch in either direction must
    // fail closed, not open.
    expect(isSessionRevoked(3, 2)).toBe(true);
  });
});
