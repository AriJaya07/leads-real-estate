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
import { leadEventTypeEnum, leadIntentEnum, leadStatusEnum } from "./enums";
import type { ContactInfo, ScoreReason } from "@/domain/scoring/types";

/**
 * Derived, freely regenerable. Everything here can be rebuilt from `raw_records`
 * by re-running normalization + classification. Human-authored data lives in
 * `lead_states` so reprocessing never destroys an agent's work.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawRecordId: uuid("raw_record_id")
      .notNull()
      .references(() => rawRecords.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    /** Points at the surviving lead when this one is a near-duplicate. */
    canonicalLeadId: uuid("canonical_lead_id"),

    externalId: text("external_id").notNull(),
    externalUrl: text("external_url"),
    sourceGroup: text("source_group"),

    authorName: text("author_name"),
    authorUrl: text("author_url"),
    authorAvatarUrl: text("author_avatar_url"),
    authorExternalId: text("author_external_id"),

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
    uniqueIndex("leads_raw_record_key").on(t.rawRecordId),
    index("leads_dataset_idx").on(t.datasetId),
    index("leads_intent_score_idx").on(t.intent, t.intentScore),
    index("leads_posted_at_idx").on(t.postedAt),
    index("leads_canonical_idx").on(t.canonicalLeadId),
    index("leads_property_types_idx").using("gin", t.propertyTypes),
    index("leads_locations_idx").using("gin", t.locations),
    index("leads_attributes_idx").using("gin", t.attributes),
    index("leads_search_idx").using(
      "gin",
      sql`to_tsvector('simple', coalesce(${t.body}, '') || ' ' || coalesce(${t.authorName}, '') || ' ' || coalesce(${t.listingTitle}, ''))`,
    ),
    index("leads_body_trgm_idx").using("gin", sql`${t.body} gin_trgm_ops`),
    /**
     * Additive, not a replacement for the two unfiltered indexes above: most
     * reads (`lead-queries.ts`, `facets.ts`, `dataset-queries.ts`) scope to
     * `isSpam = false AND canonicalLeadId IS NULL`, but a few genuinely need the
     * full table regardless of that scope (`includeSpam`/`includeDuplicates`
     * filters, and `findCanonicalDuplicate`'s dedupe lookup in
     * `process-records.ts`, which explicitly searches across spam and duplicate
     * rows too). Smaller, targeted indexes for the common case; the full ones
     * stay for everything else.
     */
    index("leads_active_posted_at_idx")
      .on(t.postedAt)
      .where(sql`${t.isSpam} = false AND ${t.canonicalLeadId} IS NULL`),
    index("leads_active_intent_score_idx")
      .on(t.intent, t.intentScore)
      .where(sql`${t.isSpam} = false AND ${t.canonicalLeadId} IS NULL`),
  ],
);

/**
 * Human-owned state. Survives every reprocess, reclassification and mapping
 * profile change. Keyed by lead id but written only by people.
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

/** Append-only audit trail and funnel analytics source. */
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
export type LeadStateRow = typeof leadStates.$inferSelect;
export type LeadEventRow = typeof leadEvents.$inferSelect;
