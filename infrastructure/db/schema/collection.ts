import {
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
import { companies } from "./company";
import { users } from "./auth";
import { sources, datasets } from "./catalog";
import { categories } from "./categories";
import { scrapeRequestStatusEnum } from "./enums";

/**
 * "Which Apify actor scrapes X" — admin-registered, never hardcoded. Same
 * philosophy as `sources`/`mapping_profiles`: adding a platform or a new
 * requirement shape (a different actor, or the same actor with a different
 * input shape) is a row here, not a deploy. `platform`/`requirementKind` are
 * free text rather than a Postgres enum on purpose — "Other Apify-supported
 * sources" (the product requirement) must not need a migration to add.
 */
export const actorTemplates = pgTable(
  "actor_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** e.g. "instagram", "facebook", "linkedin", "other" — display/grouping only. */
    platform: text("platform").notNull(),
    /**
     * Which business vertical this actor is most relevant to — null means
     * "useful for every category" (e.g. a generic Facebook Groups scraper).
     * Has to match `companies.categoryId` for the recommend-sort in
     * `RequestScrapeForm` to work.
     */
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** e.g. "profile_posts", "hashtag_search", "post_likers", "company_posts". */
    requirementKind: text("requirement_kind").notNull(),
    description: text("description"),
    /** Apify actor id or `username/actor-name` slug, exactly as the Run Actor API expects. */
    actorId: text("actor_id").notNull(),
    /** Baseline input merged under whatever the requester supplies — see domain/collection/actor-request.ts. */
    defaultInput: jsonb("default_input").$type<Record<string, unknown>>().notNull().default({}),
    /** Param keys a requester must supply before a run is even started. */
    requiredParams: text("required_params").array().notNull().default([]),
    /** Informational only — shown in the trigger form, never enforced. */
    costNote: text("cost_note"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("actor_templates_name_key").on(t.name)],
);

/**
 * One row per "user asked the system to go collect data" request — the history
 * this feature is required to track, independent of `sync_runs` (which tracks
 * *ingesting* a dataset that already exists, not *producing* one). Snapshots
 * `platform`/`requirementKind`/`actorId`/`templateName` at request time so
 * history reads correctly even if the template is later edited or deleted.
 */
export const scrapeRequests = pgTable(
  "scrape_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actorTemplateId: uuid("actor_template_id").references(() => actorTemplates.id, {
      onDelete: "set null",
    }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),

    templateName: text("template_name").notNull(),
    platform: text("platform").notNull(),
    requirementKind: text("requirement_kind").notNull(),
    actorId: text("actor_id").notNull(),
    /** Exactly what the requester submitted (pre-merge with the template default). */
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    /** `paramsFingerprint()` of `params` — backs the recent-duplicate-request guard. */
    paramsFingerprint: text("params_fingerprint").notNull(),

    status: scrapeRequestStatusEnum("status").notNull().default("queued"),
    apifyRunId: text("apify_run_id"),
    apifyDatasetId: text("apify_dataset_id"),
    /** Set once the run's output dataset is wired into the normal sync/ingest pipeline. */
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    datasetId: uuid("dataset_id").references(() => datasets.id, { onDelete: "set null" }),

    itemCount: integer("item_count").notNull().default(0),
    /** USD, best-effort from Apify's run stats — see domain/sync/ports.ts's `ActorRun.usageUsd`. */
    usageUsd: real("usage_usd"),
    errorSummary: text("error_summary"),

    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("scrape_requests_apify_run_id_key").on(t.apifyRunId),
    index("scrape_requests_company_requested_idx").on(t.companyId, t.requestedAt),
    index("scrape_requests_status_idx").on(t.status),
    // Backs the "same template + same params requested recently" dedup guard.
    index("scrape_requests_dedup_idx").on(t.companyId, t.actorTemplateId, t.paramsFingerprint, t.requestedAt),
  ],
);

export type ActorTemplateRow = typeof actorTemplates.$inferSelect;
export type ScrapeRequestRow = typeof scrapeRequests.$inferSelect;
