import { pgEnum } from "drizzle-orm/pg-core";

export const sourceKindEnum = pgEnum("source_kind", ["apify", "n8n", "webform", "manual"]);

/**
 * What *shape* a record is, independent of `sourceKindEnum` (which models
 * transport — apify/n8n/webform — not content). A "Post Likers" scrape produces
 * a person, not a post: no body text, no phrases to classify, a different dedup
 * identity. `content_post` is the default and covers every source today.
 */
export const leadRecordKindEnum = pgEnum("lead_record_kind", [
  "content_post",
  "engagement_like",
  "engagement_comment",
]);

/**
 * Which social platform a mapping profile's payloads come from — needed to know
 * whether a scraped identity id (`authorExternalId`) fills `leads.facebookId` or
 * `leads.instagramId` when merging appearances into one person. Independent of
 * `sourceKindEnum` (transport) and `leadRecordKindEnum` (content shape) for the
 * same reason those two are independent of each other.
 */
export const platformEnum = pgEnum("platform", ["facebook", "instagram", "other"]);

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

/**
 * Per-*appearance* classification (one scraped post/like/comment). Unchanged by
 * the person-centric refactor — still what `rules-classifier.ts` outputs per
 * item. `leadTypeEnum` below is the separate, person-level business
 * classification rolled up from many appearances; the two are deliberately not
 * the same enum; see domain.md.
 */
export const leadIntentEnum = pgEnum("lead_intent", ["buyer", "seller", "agent", "other"]);

/**
 * Person-level business classification — rolled up from every appearance a
 * person has (buyer/seller/investor scores + agent/broker signal), not read
 * off any single post. See `domain/scoring/lead-rollup.ts`.
 */
export const leadTypeEnum = pgEnum("lead_type", [
  "buyer",
  "seller",
  "agent",
  "broker",
  "investor",
  "unknown",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "interested",
  "negotiation",
  "closed",
  "rejected",
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
