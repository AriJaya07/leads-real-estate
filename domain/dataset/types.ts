/**
 * Dataset-shape domain types. Pure — no framework, no database, no I/O.
 *
 * These describe how an arbitrary upstream payload is *discovered* (field profile)
 * and how it is *projected* onto the canonical lead (mapping rules). Both are
 * stored as data, which is what makes the platform adapt to new datasets without
 * a code change.
 */

export type InferredType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "url"
  | "object"
  | "array"
  | "null"
  | "mixed";

export interface FieldProfile {
  /** Dot/bracket path into the payload, e.g. `user.name`, `attachments[].photo_image.uri`. */
  path: string;
  type: InferredType;
  nullable: boolean;
  /** Fraction of sampled records where the path resolved to a non-empty value. */
  fillRate: number;
  cardinality: number;
  sampleValues: unknown[];
}

/** Stable hash over the sorted `path:type` set. A change means the shape moved. */
export type SchemaFingerprint = string;

export interface SchemaDiff {
  added: string[];
  removed: string[];
  typeChanged: { path: string; from: InferredType; to: InferredType }[];
}

// ---------------------------------------------------------------------------
// Mapping rules
// ---------------------------------------------------------------------------

export type TransformId =
  | "toIso8601"
  | "toNumber"
  | "toString"
  | "trim"
  | "flattenUnique"
  | "parseMoney"
  | "parseBedrooms"
  | "parseBathrooms"
  | "lowercase";

export interface FieldRule {
  /**
   * Ordered candidate paths. The first that resolves to a non-empty value wins.
   * This is what lets one profile serve both the old and the new upstream shape,
   * so actor output drift degrades gracefully instead of silently producing nulls.
   */
  from: string[];
  transform?: TransformId | TransformId[];
  default?: unknown;
  /** Last-resort extraction from another field, e.g. group slug out of a URL. */
  fallback?: { on: string; regex: string; group?: number };
}

export interface EngagementRule {
  likes?: string;
  comments?: string;
  shares?: string;
}

/**
 * Plain-path projection of what an `engagement_*` record engaged with — the
 * target post's identity and a cheap denormalized snapshot (the target post
 * itself is usually never ingested as its own record). Only meaningful when
 * the mapping profile's `recordKind` is `engagement_like`/`engagement_comment`.
 */
export interface EngagementContextRule {
  targetPostExternalId?: string;
  targetPostUrl?: string;
  targetListingTitle?: string;
  targetPriceRaw?: string;
  targetLocationRaw?: string;
}

/**
 * Canonical target fields. Deliberately a small, stable spine: alerting and
 * scoring must mean something specific by "buyer intent", which is impossible
 * over a fully open schema. Everything outside the spine flows to `attributes`
 * via passthrough and is still filterable.
 */
export interface MappingRules {
  externalId?: FieldRule;
  externalUrl?: FieldRule;
  sourceGroup?: FieldRule;
  authorName?: FieldRule;
  authorUrl?: FieldRule;
  authorAvatarUrl?: FieldRule;
  authorExternalId?: FieldRule;
  /** Handle/username — distinct from `authorName` (display name), used for display only, never identity merge. */
  authorUsername?: FieldRule;
  /** The person's own bio/description, distinct from `body` (what they posted) and `listingTitle`. */
  authorBio?: FieldRule;
  /** The person's stated location (profile/bio), distinct from `locationRaw` (a listing's location). */
  authorLocation?: FieldRule;
  body?: FieldRule;
  listingTitle?: FieldRule;
  images?: FieldRule;
  postedAt?: FieldRule;
  priceRaw?: FieldRule;
  locationRaw?: FieldRule;
  bedrooms?: FieldRule;
  bathrooms?: FieldRule;
  engagement?: EngagementRule;
  engagementContext?: EngagementContextRule;
}

export const CANONICAL_FIELDS = [
  "externalId",
  "externalUrl",
  "sourceGroup",
  "authorName",
  "authorUrl",
  "authorAvatarUrl",
  "authorExternalId",
  "authorUsername",
  "authorBio",
  "authorLocation",
  "body",
  "listingTitle",
  "images",
  "postedAt",
  "priceRaw",
  "locationRaw",
  "bedrooms",
  "bathrooms",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/** Result of projecting one raw payload through a mapping profile. */
export interface NormalizedRecord {
  externalId: string;
  externalUrl: string | null;
  sourceGroup: string | null;
  authorName: string | null;
  authorUrl: string | null;
  authorAvatarUrl: string | null;
  authorExternalId: string | null;
  authorUsername: string | null;
  authorBio: string | null;
  authorLocation: string | null;
  body: string;
  listingTitle: string | null;
  images: string[];
  postedAt: Date;
  priceRaw: string | null;
  locationRaw: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  engagement: { likes: number; comments: number; shares: number };
  /** Only populated when the mapping profile declares `engagementContext` rules. */
  engagementContext: {
    targetPostExternalId: string | null;
    targetPostUrl: string | null;
    targetListingTitle: string | null;
    targetPriceRaw: string | null;
    targetLocationRaw: string | null;
  };
  attributes: Record<string, unknown>;
}
