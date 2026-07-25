import { pgEnum } from "drizzle-orm/pg-core";

export const sourceKindEnum = pgEnum("source_kind", ["apify", "n8n", "webform", "manual"]);

export const datasetStatusEnum = pgEnum("dataset_status", [
  "active",
  "paused",
  "archived",
  "missing",
]);

/**
 * `schema_drift` is deliberately a health state rather than an error: the dataset
 * still syncs, but its shape changed and the mapping profile needs human review
 * before we trust the normalized output.
 */
export const datasetHealthEnum = pgEnum("dataset_health", [
  "unknown",
  "healthy",
  "stale",
  "degraded",
  "schema_drift",
  "error",
]);

export const syncTriggerEnum = pgEnum("sync_trigger", ["cron", "webhook", "manual", "discovery"]);

export const syncStatusEnum = pgEnum("sync_status", [
  "running",
  "succeeded",
  "partial",
  "failed",
  "skipped",
]);

export const logLevelEnum = pgEnum("log_level", ["debug", "info", "warn", "error"]);

export const leadIntentEnum = pgEnum("lead_intent", ["buyer", "seller", "agent", "other"]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "viewing_booked",
  "converted",
  "lost",
  "archived",
  "spam",
]);

export const alertChannelEnum = pgEnum("alert_channel", ["email", "whatsapp", "slack", "inapp"]);

export const alertDeliveryStatusEnum = pgEnum("alert_delivery_status", [
  "pending",
  "sent",
  "failed",
  "suppressed",
]);

export const userRoleEnum = pgEnum("user_role", ["admin", "agent"]);

export const leadEventTypeEnum = pgEnum("lead_event_type", [
  "created",
  "status_changed",
  "assigned",
  "note_added",
  "contacted",
  "alerted",
  "reclassified",
  "merged",
]);
