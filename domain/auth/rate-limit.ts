import { LOGIN_MAX_FAILED_ATTEMPTS } from "@/shared/constants";

/**
 * Login throttling decision. Pure on purpose — the attempt log itself lives in
 * Postgres (`login_attempts`, counted by `application/auth/login-attempts.ts`);
 * this just says what a given recent-failure count means, so the threshold is
 * unit-testable without a database.
 */
export function isLoginRateLimited(recentFailedAttempts: number): boolean {
  return recentFailedAttempts >= LOGIN_MAX_FAILED_ATTEMPTS;
}
