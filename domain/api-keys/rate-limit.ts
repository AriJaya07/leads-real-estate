export interface RateLimitWindowCount {
  windowSeconds: number;
  /** Already-incremented count for this window (the request being evaluated counts toward it). */
  count: number;
  /** `null` = unlimited on this plan, e.g. Enterprise — see `plans.apiRateLimitPerMinute`/`apiRateLimitBurst`. */
  limit: number | null;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the tightest exceeded window resets — `null` when `allowed` is true. */
  retryAfterSeconds: number | null;
}

/**
 * Pure decision over already-incremented fixed-window counts — the counting
 * itself (an atomic upsert per window) lives in
 * `application/api-keys/rate-limiter.ts`, same split as `isLoginRateLimited`
 * (`domain/auth/rate-limit.ts`) versus its own DB-backed counter. Checks every
 * window rather than stopping at the first exceeded one, so the reported
 * `retryAfterSeconds` is always the longest wait actually required.
 */
export function evaluateRateLimit(windows: readonly RateLimitWindowCount[]): RateLimitDecision {
  let retryAfterSeconds: number | null = null;

  for (const window of windows) {
    if (window.limit === null || window.count <= window.limit) continue;
    retryAfterSeconds = Math.max(retryAfterSeconds ?? 0, window.windowSeconds);
  }

  return { allowed: retryAfterSeconds === null, retryAfterSeconds };
}
