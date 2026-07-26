import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { datasets } from "./catalog";
import { users } from "./auth";
import { rawRecords } from "./sync";
import {
  leadEventTypeEnum,
  leadIntentEnum,
  leadRecordKindEnum,
  leadStatusEnum,
  leadTypeEnum,
  platformEnum,
} from "./enums";
import type { ContactInfo, ScoreReason } from "@/domain/scoring/types";

/**
 * One row per PERSON, not per post. Deduped across every source they were
 * collected from (Facebook Groups, Posts, Comments, Post Likers, Instagram
 * Post Likers, ...) via `facebookId`/`instagramId`/`profileUrl` identity match
 * (`domain/lead/identity.ts`) — never fuzzy name matching, same risk posture as
 * the rest of this codebase (a wrong merge is worse than a duplicate).
 *
 * Still fully derived and freely regenerable, one level up from before: every
 * column here is rolled up from this person's `lead_appearances` rows
 * (`domain/scoring/lead-rollup.ts::rollupPersonScores`) and can be recomputed
 * from them at any time. Human-authored data stays in `lead_states`, keyed to
 * this table's id, same split as always.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // --- Identity — at least one of these is present; used for merge/dedup ---
    facebookId: text("facebook_id"),
    instagramId: text("instagram_id"),
    /** Normalized (protocol/query/trailing-slash stripped) — see `domain/lead/identity.ts`. */
    profileUrl: text("profile_url"),
    username: text("username"),

    // --- Personal information ---
    name: text("name"),
    avatarUrl: text("avatar_url"),
    /** The person's stated location (bio), distinct from a listing's location. */
    location: text("location"),
    bio: text("bio"),
    contact: jsonb("contact").$type<ContactInfo>().notNull().default({}),

    // --- Business information ---
    leadType: leadTypeEnum("lead_type").notNull().default("unknown"),

    // --- AI analysis (rollup) ---
    buyerScore: integer("buyer_score").notNull().default(0),
    sellerScore: integer("seller_score").notNull().default(0),
    investorScore: integer("investor_score").notNull().default(0),
    confidenceScore: integer("confidence_score").notNull().default(0),
    aiExplanation: text("ai_explanation").notNull().default(""),
    classifierId: text("classifier_id").notNull().default("unclassified"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),

    /** Union across every non-spam, non-duplicate appearance. Open vocabulary. */
    propertyTypes: text("property_types").array().notNull().default(sql`'{}'::text[]`),
    locations: text("locations").array().notNull().default(sql`'{}'::text[]`),

    /** Most-recently-stated non-null budget across appearances (last-stated wins). */
    budgetMin: bigint("budget_min", { mode: "number" }),
    budgetMax: bigint("budget_max", { mode: "number" }),
    budgetCurrency: text("budget_currency"),
    budgetUsdMin: bigint("budget_usd_min", { mode: "number" }),
    budgetUsdMax: bigint("budget_usd_max", { mode: "number" }),

    /** `max(postedAt)` across appearances — the recency input to priority ranking. */
    latestAppearanceAt: timestamp("latest_appearance_at", { withTimezone: true }),
    /** How many non-spam, non-duplicate appearances this person has. */
    appearanceCount: integer("appearance_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_facebook_id_key").on(t.facebookId).where(sql`${t.facebookId} IS NOT NULL`),
    uniqueIndex("leads_instagram_id_key").on(t.instagramId).where(sql`${t.instagramId} IS NOT NULL`),
    uniqueIndex("leads_profile_url_key").on(t.profileUrl).where(sql`${t.profileUrl} IS NOT NULL`),
    index("leads_lead_type_idx").on(t.leadType),
    index("leads_lead_type_buyer_score_idx").on(t.leadType, t.buyerScore),
    index("leads_latest_appearance_idx").on(t.latestAppearanceAt),
    index("leads_property_types_idx").using("gin", t.propertyTypes),
    index("leads_locations_idx").using("gin", t.locations),
    index("leads_search_idx").using(
      "gin",
      sql`to_tsvector('simple', coalesce(${t.name}, '') || ' ' || coalesce(${t.username}, '') || ' ' || coalesce(${t.bio}, ''))`,
    ),
    index("leads_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

/**
 * One row per scraped item — a post, a like, a comment — exactly what `leads`
 * meant before this table split. This is the "every source where the lead was
 * collected" ledger: `leadId` links every appearance to the one person row it
 * was merged into. Fully derived and freely regenerable from `raw_records`,
 * same as before.
 */
export const leadAppearances = pgTable(
  "lead_appearances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    rawRecordId: uuid("raw_record_id")
      .notNull()
      .references(() => rawRecords.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    /** Points at the surviving appearance when this one is a near-duplicate (repost/re-scrape). */
    canonicalAppearanceId: uuid("canonical_appearance_id"),

    /**
     * What this record *is* — a post, a like, a comment. Carried from the mapping
     * profile that produced it. `engagement_*` kinds have no meaningful `body`;
     * they're scored on what they engaged with instead (see `attributes._engagement`)
     * and deduped by identity, not text similarity.
     */
    recordKind: leadRecordKindEnum("record_kind").notNull().default("content_post"),
    platform: platformEnum("platform").notNull().default("facebook"),

    externalId: text("external_id").notNull(),
    externalUrl: text("external_url"),
    sourceGroup: text("source_group"),

    /**
     * Identity snapshot as scraped on THIS appearance — the raw input to
     * person-level rollup (`domain/scoring/lead-rollup.ts`), not the merged
     * truth. `leads.name`/`avatarUrl`/etc are the "richest, most recent wins"
     * result of merging these across every appearance a person has.
     */
    authorName: text("author_name"),
    authorUrl: text("author_url"),
    authorAvatarUrl: text("author_avatar_url"),
    authorExternalId: text("author_external_id"),
    authorUsername: text("author_username"),
    authorBio: text("author_bio"),
    authorLocation: text("author_location"),

    body: text("body").notNull().default(""),
    listingTitle: text("listing_title"),
    images: text("images").array().notNull().default(sql`'{}'::text[]`),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),

    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),

    intent: leadIntentEnum("intent").notNull().default("other"),
    intentScore: integer("intent_score").notNull().default(0),
    qualityScore: integer("quality_score").notNull().default(0),
    /** Additive signals alongside `intent` — see domain/scoring/lexicon.ts INVESTOR_PHRASES/BROKER_PHRASES. */
    investorScore: integer("investor_score").notNull().default(0),
    brokerScore: integer("broker_score").notNull().default(0),
    /** Recency-decayed ranking value, recomputed on read for the inbox ordering. */
    reach: integer("reach").notNull().default(0),
    scoreReasons: jsonb("score_reasons").$type<ScoreReason[]>().notNull().default([]),
    classifierId: text("classifier_id").notNull().default("unclassified"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),

    /** Open vocabulary — new categories appear without a code or enum change. */
    propertyTypes: text("property_types").array().notNull().default(sql`'{}'::text[]`),
    locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),

    budgetMin: bigint("budget_min", { mode: "number" }),
    budgetMax: bigint("budget_max", { mode: "number" }),
    budgetCurrency: text("budget_currency"),
    /** Normalised to USD so cross-currency budget filtering and sorting work. */
    budgetUsdMin: bigint("budget_usd_min", { mode: "number" }),
    budgetUsdMax: bigint("budget_usd_max", { mode: "number" }),

    contact: jsonb("contact").$type<ContactInfo>().notNull().default({}),
    /** Fields discovered in the payload but not part of the canonical spine. */
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),

    isSpam: boolean("is_spam").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lead_appearances_raw_record_key").on(t.rawRecordId),
    index("lead_appearances_lead_idx").on(t.leadId),
    index("lead_appearances_dataset_idx").on(t.datasetId),
    index("lead_appearances_record_kind_idx").on(t.recordKind),
    index("lead_appearances_intent_score_idx").on(t.intent, t.intentScore),
    index("lead_appearances_posted_at_idx").on(t.postedAt),
    index("lead_appearances_canonical_idx").on(t.canonicalAppearanceId),
    index("lead_appearances_property_types_idx").using("gin", t.propertyTypes),
    index("lead_appearances_locations_idx").using("gin", t.locations),
    index("lead_appearances_attributes_idx").using("gin", t.attributes),
    index("lead_appearances_search_idx").using(
      "gin",
      sql`to_tsvector('simple', coalesce(${t.body}, '') || ' ' || coalesce(${t.authorName}, '') || ' ' || coalesce(${t.listingTitle}, ''))`,
    ),
    index("lead_appearances_body_trgm_idx").using("gin", sql`${t.body} gin_trgm_ops`),
    /**
     * Additive, not a replacement for the two unfiltered indexes above: most
     * reads scope to `isSpam = false AND canonicalAppearanceId IS NULL`, but a
     * few genuinely need the full table regardless (`includeSpam`/
     * `includeDuplicates` filters, and `findCanonicalDuplicate`'s dedupe lookup
     * in `process-records.ts`, which explicitly searches across spam and
     * duplicate rows too). Smaller, targeted indexes for the common case; the
     * full ones stay for everything else.
     */
    index("lead_appearances_active_posted_at_idx")
      .on(t.postedAt)
      .where(sql`${t.isSpam} = false AND ${t.canonicalAppearanceId} IS NULL`),
    index("lead_appearances_active_intent_score_idx")
      .on(t.intent, t.intentScore)
      .where(sql`${t.isSpam} = false AND ${t.canonicalAppearanceId} IS NULL`),
    /**
     * Backs the identity-based dedup lookup for engagement records
     * (`findCanonicalDuplicate`'s `(authorExternalId, targetPostExternalId)`
     * path in process-records.ts) — an indexed equality lookup instead of the
     * trigram scan content posts use, since there's no body to compare. This is
     * appearance-level "was this exact like re-scraped" dedup, independent of
     * (and running before) the person-level identity merge in `leads`.
     */
    index("lead_appearances_engagement_author_idx")
      .on(t.authorExternalId)
      .where(sql`${t.recordKind} != 'content_post'`),
  ],
);

/**
 * Human-owned state. Survives every reprocess, reclassification and mapping
 * profile change. Keyed by *person* id (not appearance id) — assigning an
 * agent or logging a note about a person makes sense; doing it per-post never
 * quite did. Written only by people.
 */
export const leadStates = pgTable(
  "lead_states",
  {
    leadId: uuid("lead_id")
      .primaryKey()
      .references(() => leads.id, { onDelete: "cascade" }),
    status: leadStatusEnum("status").notNull().default("new"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    priority: integer("priority").notNull().default(0),
    notes: text("notes").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    bookmarked: boolean("bookmarked").notNull().default(false),
    /** Stamped by the contact action — this is how time-to-first-touch is measured. */
    firstContactedAt: timestamp("first_contacted_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_states_status_idx").on(t.status),
    index("lead_states_assigned_idx").on(t.assignedTo),
  ],
);

/** Append-only audit trail and funnel analytics source. Keyed by person id. */
export const leadEvents = pgTable(
  "lead_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    type: leadEventTypeEnum("type").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_events_lead_at_idx").on(t.leadId, t.at)],
);

/** Saved views are shareable, first-class objects rather than ad-hoc URLs. */
export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    shared: boolean("shared").notNull().default(false),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
    sort: text("sort"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("saved_views_owner_idx").on(t.ownerId)],
);

/** Daily rollup for currency normalisation; refreshed by `refreshFxRates()`. */
export const fxRates = pgTable("fx_rates", {
  currency: text("currency").primaryKey(),
  usdPerUnit: real("usd_per_unit").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeadRow = typeof leads.$inferSelect;
export type LeadAppearanceRow = typeof leadAppearances.$inferSelect;
export type LeadStateRow = typeof leadStates.$inferSelect;
export type LeadEventRow = typeof leadEvents.$inferSelect;
