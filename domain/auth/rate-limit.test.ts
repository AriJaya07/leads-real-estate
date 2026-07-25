import { describe, expect, it } from "vitest";
import { LOGIN_MAX_FAILED_ATTEMPTS } from "@/shared/constants";
import { isLoginRateLimited } from "./rate-limit";

describe("isLoginRateLimited", () => {
  it("allows sign-in below the threshold", () => {
    expect(isLoginRateLimited(LOGIN_MAX_FAILED_ATTEMPTS - 1)).toBe(false);
  });

  it("blocks sign-in once the threshold is reached", () => {
    expect(isLoginRateLimited(LOGIN_MAX_FAILED_ATTEMPTS)).toBe(true);
  });

  it("stays blocked well past the threshold", () => {
    expect(isLoginRateLimited(LOGIN_MAX_FAILED_ATTEMPTS + 10)).toBe(true);
  });

  it("allows sign-in with no prior failures", () => {
    expect(isLoginRateLimited(0)).toBe(false);
  });
});
