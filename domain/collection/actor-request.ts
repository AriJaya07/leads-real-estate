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

export type ActorParamFieldType = "text" | "textarea" | "url" | "number" | "select" | "multiselect" | "tags";

/**
 * One admin-authored filter field for a template's "Configure filters" step —
 * the data-driven replacement for a raw JSON textarea. `RequestScrapeForm`
 * renders one of these generically per `type` (the "one field renderer,
 * reused everywhere" component named in the Apify+N8N architecture doc's
 * §3.2) rather than special-casing a platform in component code. `key` is the
 * Apify actor input key this field ultimately fills — order in the array is
 * display order.
 */
export interface ActorParamField {
  key: string;
  label: string;
  type: ActorParamFieldType;
  required: boolean;
  /** Shown as input placeholder / help text under the field. */
  placeholder?: string;
  helpText?: string;
  /** `select`/`multiselect` only. */
  options?: { label: string; value: string }[];
}

export interface ActorTemplateDefWithSchema extends ActorTemplateDef {
  /** Empty/undefined means "no structured schema yet" — falls back to `requiredParams` + raw JSON. */
  paramSchema?: ActorParamField[];
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
 *
 * Validates against `paramSchema` when the template has one (required-field
 * presence plus `number`/`multiselect` shape), otherwise falls back to the
 * older `requiredParams`-only presence check — keeps every template seeded
 * before `paramSchema` existed, and every existing test/fixture, working
 * unchanged.
 */
export function buildActorInput(
  template: ActorTemplateDefWithSchema,
  params: Record<string, unknown>,
): BuildActorInputResult {
  const schema = template.paramSchema;

  if (!schema || schema.length === 0) {
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

  const missing: string[] = [];
  const coerced: Record<string, unknown> = {};

  for (const field of schema) {
    const raw = params[field.key];
    const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);

    if (empty) {
      if (field.required) missing.push(field.key);
      continue;
    }

    if (field.type === "number") {
      const num = typeof raw === "number" ? raw : Number(raw);
      if (Number.isNaN(num)) {
        if (field.required) missing.push(field.key);
        continue;
      }
      coerced[field.key] = num;
    } else if (field.type === "multiselect") {
      coerced[field.key] = Array.isArray(raw) ? raw : [raw];
    } else if (field.type === "tags") {
      // Free-form array input (e.g. Apify's `searchStringsArray`/`startUrls`) —
      // `multiselect` can't cover this, it's a fixed-option toggle group.
      const list = Array.isArray(raw)
        ? (raw as unknown[]).map(String)
        : String(raw).split(/[\n,]+/);
      const cleaned = list.map((v) => v.trim()).filter(Boolean);
      if (cleaned.length === 0) {
        if (field.required) missing.push(field.key);
        continue;
      }
      coerced[field.key] = cleaned;
    } else {
      coerced[field.key] = raw;
    }
  }

  return {
    ok: missing.length === 0,
    input: { ...template.defaultInput, ...coerced },
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
