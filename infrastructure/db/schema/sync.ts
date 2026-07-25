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
import { datasets } from "./catalog";
import { logLevelEnum, syncStatusEnum, syncTriggerEnum } from "./enums";

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
  ],
);

/** Structured log lines backing the admin log viewer. */
export const syncEvents = pgTable(
  "sync_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syncRunId: uuid("sync_run_id")
      .notNull()
      .references(() => syncRuns.id, { onDelete: "cascade" }),
    level: logLevelEnum("level").notNull().default("info"),
    stage: text("stage").notNull(),
    message: text("message").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sync_events_run_at_idx").on(t.syncRunId, t.at)],
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
  ],
);

export type SyncRunRow = typeof syncRuns.$inferSelect;
export type SyncEventRow = typeof syncEvents.$inferSelect;
export type RawRecordRow = typeof rawRecords.$inferSelect;
