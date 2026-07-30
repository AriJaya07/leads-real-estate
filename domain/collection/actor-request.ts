/**
 * Pure logic for turning "an admin-registered actor template + a user's requirement
 * params" into the exact input body an Apify actor run needs. No I/O, no Apify SDK —
 * see docs/coding-standards.md's layering rule.
 */

import type { ActorRunStatus } from "@/domain/sync/ports";

export type ScrapeRequestStatus = "queued" | "running" | "succeeded" | "failed" | "aborted" | "timed_out";

/** Apify's run states collapsed onto our smaller `scrape_request_status` enum. */
export function toScrapeRequestStatus(status: ActorRunStatus): ScrapeRequestStatus {
  switch (status) {
    case "READY":
    case "RUNNING":
    case "TIMING-OUT":
    case "ABORTING":
      return "running";
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "ABORTED":
      return "aborted";
    case "TIMED-OUT":
      return "timed_out";
  }
}

export interface ActorTemplateDef {
  actorId: string;
  /** Baseline input every run for this template starts from (e.g. `{ resultsType: "posts" }`). */
  defaultInput: Record<string, unknown>;
  /** Param keys the caller must supply — checked before spending an API call. */
  requiredParams: string[];
}

export interface BuildActorInputResult {
  ok: boolean;
  input: Record<string, unknown>;
  missing: string[];
}

/**
 * User params win over `defaultInput` on key collision — a template's baseline is a
 * default, not a lock. Missing required params short-circuits before the caller ever
 * reaches the network, satisfying "prevent unnecessary API usage" for the cheapest
 * possible case: a request that was never going to succeed.
 */
export function buildActorInput(
  template: ActorTemplateDef,
  params: Record<string, unknown>,
): BuildActorInputResult {
  const missing = template.requiredParams.filter((key) => {
    const value = params[key];
    return value === undefined || value === null || value === "";
  });

  return {
    ok: missing.length === 0,
    input: { ...template.defaultInput, ...params },
    missing,
  };
}

/**
 * Stable hash key for "has this exact request already been made recently" dedup —
 * sorted keys so `{a:1,b:2}` and `{b:2,a:1}` collide, which is what makes the dedup
 * guard in `application/collection/scrape-requests.actions.ts` actually catch a
 * double-click.
 */
export function paramsFingerprint(params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}
