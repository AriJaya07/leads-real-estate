import type {
  EngagementRule,
  FieldRule,
  MappingRules,
  NormalizedRecord,
  TransformId,
} from "./types";

/**
 * Applies a declarative mapping profile to a raw payload.
 *
 * Pure and dependency-free so it can be unit-tested against real captured
 * payloads, and so a mapping change can be replayed over `raw_records` without
 * touching the network.
 */

/** Resolves `user.name`, `attachments[].photo_image.uri`, `images[]`. */
export function resolvePath(source: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = source;

  for (let i = 0; i < segments.length; i++) {
    if (current === null || current === undefined) return undefined;

    const segment = segments[i];
    const isArraySegment = segment.endsWith("[]");
    const key = isArraySegment ? segment.slice(0, -2) : segment;

    if (key) {
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }

    if (isArraySegment) {
      if (!Array.isArray(current)) return undefined;
      // Fan out: the remaining segments apply to every element.
      const rest = segments.slice(i + 1).join(".");
      if (!rest) return current;
      return current
        .map((element) => resolvePath(element, rest))
        .flat()
        .filter((v) => v !== undefined && v !== null);
    }
  }

  return current;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

/** `IDR2,222` / `$1.2M` / `Rp 5 miliar` -> a plain number, or null. */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;

  // Alternation is longest-first: regex alternation is leftmost-wins, so a bare
  // `m` placed before `miliar` would read "Rp 5 miliar" as 5 million — a
  // thousand-fold budget error.
  const match =
    /(\d[\d.,]*)\s*(billion|million|miliar|milyar|ribu|juta|mn|jt|rb|k|m|b)?/i.exec(input);
  if (!match) return null;

  // Strip thousands separators, keeping a decimal point only when it is one.
  const raw = match[1].replace(/,/g, "");
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return null;

  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === "k" || suffix === "rb" || suffix === "ribu"
      ? 1_000
      : suffix === "jt" || suffix === "juta" || suffix === "m" || suffix === "mn" || suffix === "million"
        ? 1_000_000
        : suffix === "miliar" || suffix === "milyar" || suffix === "b" || suffix === "billion"
          ? 1_000_000_000
          : 1;

  return value * multiplier;
}

/** `3 beds · 3 bath · Villa` -> 3. Structured beats regex over freeform text. */
export function parseBedrooms(input: unknown): number | null {
  if (typeof input === "number") return input;
  if (typeof input !== "string") return null;
  const match = /(\d+)\s*(?:beds?|bedrooms?|br|kamar tidur|kt)\b/i.exec(input);
  return match ? Number(match[1]) : null;
}

function parseBathrooms(input: unknown): number | null {
  if (typeof input === "number") return input;
  if (typeof input !== "string") return null;
  const match = /(\d+)\s*(?:baths?|bathrooms?|ba|kamar mandi|km)\b/i.exec(input);
  return match ? Number(match[1]) : null;
}

function toIso8601(input: unknown): string | null {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input.toISOString();
  if (typeof input === "number") {
    // Apify emits both seconds and milliseconds depending on the actor.
    const ms = input > 10_000_000_000 ? input : input * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof input === "string") {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function flattenUnique(input: unknown): string[] {
  const values = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values.flat(3)) {
    if (typeof value !== "string" || !value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

const TRANSFORMS: Record<TransformId, (input: unknown) => unknown> = {
  toIso8601,
  toNumber: (v) => (typeof v === "number" ? v : Number.parseFloat(String(v ?? ""))),
  toString: (v) => (v === null || v === undefined ? null : String(v)),
  trim: (v) => (typeof v === "string" ? v.trim() : v),
  lowercase: (v) => (typeof v === "string" ? v.toLowerCase() : v),
  flattenUnique,
  parseMoney,
  parseBedrooms,
  parseBathrooms,
};

function applyTransforms(value: unknown, transform: FieldRule["transform"]): unknown {
  if (!transform) return value;
  const list = Array.isArray(transform) ? transform : [transform];
  return list.reduce<unknown>((acc, id) => TRANSFORMS[id]?.(acc) ?? acc, value);
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

function applyFieldRule(payload: Record<string, unknown>, rule?: FieldRule): unknown {
  if (!rule) return undefined;

  // Ordered candidates: first non-empty wins. This is what lets one profile
  // serve both the old and the new upstream shape.
  for (const path of rule.from) {
    const resolved = resolvePath(payload, path);
    if (!isEmpty(resolved)) return applyTransforms(resolved, rule.transform);
  }

  if (rule.fallback) {
    const subject = resolvePath(payload, rule.fallback.on);
    if (typeof subject === "string") {
      const match = new RegExp(rule.fallback.regex).exec(subject);
      const group = rule.fallback.group ?? 1;
      if (match?.[group]) return applyTransforms(decodeURIComponent(match[group]), rule.transform);
    }
  }

  return rule.default;
}

function readEngagement(payload: Record<string, unknown>, rule?: EngagementRule) {
  const read = (path?: string) => {
    if (!path) return 0;
    const value = resolvePath(payload, path);
    const num = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(num) ? num : 0;
  };
  return { likes: read(rule?.likes), comments: read(rule?.comments), shares: read(rule?.shares) };
}

/** Paths consumed by the rules — used to decide what passthrough should keep. */
function mappedRootKeys(rules: MappingRules): Set<string> {
  const keys = new Set<string>();
  const add = (path: string) => keys.add(path.split(/[.[]/)[0]);

  for (const value of Object.values(rules)) {
    if (!value) continue;
    if ("from" in value) {
      for (const path of (value as FieldRule).from) add(path);
      const fallback = (value as FieldRule).fallback;
      if (fallback) add(fallback.on);
    } else {
      for (const path of Object.values(value as EngagementRule)) {
        if (path) add(path);
      }
    }
  }
  return keys;
}

function stableId(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) hash = (hash * 33) ^ json.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

export function applyMapping(
  payload: Record<string, unknown>,
  rules: MappingRules,
  options: { passthrough?: boolean } = {},
): NormalizedRecord {
  const str = (rule?: FieldRule): string | null => {
    const value = applyFieldRule(payload, rule);
    if (isEmpty(value)) return null;
    return typeof value === "string" ? value : String(value);
  };

  const num = (rule?: FieldRule): number | null => {
    const value = applyFieldRule(payload, rule);
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const postedAtRaw = applyFieldRule(payload, rules.postedAt);
  const postedIso = toIso8601(postedAtRaw);

  const imagesRaw = applyFieldRule(payload, rules.images);
  const images = flattenUnique(imagesRaw);

  const attributes: Record<string, unknown> = {};
  if (options.passthrough) {
    const consumed = mappedRootKeys(rules);
    for (const [key, value] of Object.entries(payload)) {
      // Unmapped fields stay queryable, so a new upstream field becomes a
      // filter without a code change.
      if (!consumed.has(key) && !isEmpty(value)) attributes[key] = value;
    }
  }

  return {
    externalId: str(rules.externalId) ?? stableId(payload),
    externalUrl: str(rules.externalUrl),
    sourceGroup: str(rules.sourceGroup),
    authorName: str(rules.authorName),
    authorUrl: str(rules.authorUrl),
    authorAvatarUrl: str(rules.authorAvatarUrl),
    authorExternalId: str(rules.authorExternalId),
    body: str(rules.body) ?? "",
    listingTitle: str(rules.listingTitle),
    images,
    // A missing timestamp must not silently become "now" — that would make every
    // backfilled post look brand new and poison recency ranking and alerting.
    postedAt: postedIso ? new Date(postedIso) : new Date(0),
    priceRaw: str(rules.priceRaw),
    locationRaw: str(rules.locationRaw),
    bedrooms: num(rules.bedrooms),
    bathrooms: num(rules.bathrooms),
    engagement: readEngagement(payload, rules.engagement),
    attributes,
  };
}
