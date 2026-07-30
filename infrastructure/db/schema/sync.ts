import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { datasets, sources } from "./catalog";
import { companies } from "./company";
import { logLevelEnum, syncStatusEnum, syncTriggerEnum } from "./enums";

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalized from `datasets.companyId`. */
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    trigger: syncTriggerEnum("trigger").notNull(),
    status: syncStatusEnum("status").notNull().default("running"),

    itemsSeen: integer("items_seen").notNull().default(0),
    itemsNew: integer("items_new").notNull().default(0),
    itemsUpdated: integer("items_updated").notNull().default(0),
    itemsDuplicate: integer("items_duplicate").notNull().default(0),
    itemsFailed: integer("items_failed").notNull().default(0),
    leadsCreated: integer("leads_created").notNull().default(0),

    /** Cursor at run start, so a failed run can be reasoned about after the fact. */
    startCursor: jsonb("start_cursor").$type<Record<string, unknown>>(),
    endCursor: jsonb("end_cursor").$type<Record<string, unknown>>(),

    errorSummary: text("error_summary"),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("sync_runs_dataset_started_idx").on(t.datasetId, t.startedAt),
    index("sync_runs_status_idx").on(t.status),
    index("sync_runs_company_idx").on(t.companyId),
  ],
);

/** Structured log lines backing the admin log viewer. */
export const syncEvents = pgTable(
  "sync_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalized from `sync_runs.companyId`. */
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    syncRunId: uuid("sync_run_id")
      .notNull()
      .references(() => syncRuns.id, { onDelete: "cascade" }),
    level: logLevelEnum("level").notNull().default("info"),
    stage: text("stage").notNull(),
    message: text("message").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sync_events_run_at_idx").on(t.syncRunId, t.at),
    index("sync_events_company_idx").on(t.companyId),
  ],
);

/**
 * The verbatim upstream payload. This is the replay source of truth: changing a
 * mapping profile or swapping the classifier re-derives every lead from here
 * without re-hitting the upstream API.
 */
export const rawRecords = pgTable(
  "raw_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalized from `datasets.companyId`. */
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    sourceItemId: text("source_item_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** SHA-256 of the normalised text body — cross-dataset duplicate detection. */
    contentHash: text("content_hash").notNull(),
    /** SHA-256 of the whole payload — detects upstream edits to an existing item. */
    payloadHash: text("payload_hash").notNull(),
    ingestOffset: integer("ingest_offset"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    syncRunId: uuid("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("raw_records_dataset_item_key").on(t.datasetId, t.sourceItemId),
    index("raw_records_content_hash_idx").on(t.contentHash),
    index("raw_records_dataset_idx").on(t.datasetId),
    index("raw_records_company_idx").on(t.companyId),
  ],
);

/**
 * Request-level log of actual Apify HTTP calls — lower-level than `sync_runs`
 * (one run can make many requests inside it, e.g. paginated `fetchItems`
 * calls). Operational telemetry, not business data — short retention
 * expected (see docs/tech-debt.md's retention entries), not the same
 * keep-forever posture as `raw_records`.
 */
export const apiRequests = pgTable(
  "api_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    endpoint: text("endpoint").notNull(),
    method: text("method").notNull(),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("api_requests_company_requested_idx").on(t.companyId, t.requestedAt),
    index("api_requests_source_requested_idx").on(t.sourceId, t.requestedAt),
  ],
);

export type SyncRunRow = typeof syncRuns.$inferSelect;
export type SyncEventRow = typeof syncEvents.$inferSelect;
export type RawRecordRow = typeof rawRecords.$inferSelect;
export type ApiRequestRow = typeof apiRequests.$inferSelect;
