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
 * Lifecycle of one triggered Apify actor run, driven by the run-status webhook
 * (`app/api/webhooks/apify/route.ts`) — mirrors Apify's own run states 1:1 so no
 * translation table is needed. `queued` is the local state between "we called the
 * Start Run API" and the first webhook/poll telling us it actually started.
 */
export const scrapeRequestStatusEnum = pgEnum("scrape_request_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "aborted",
  "timed_out",
]);

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

/**
 * Fixed 4-tier hierarchy — owner > admin > manager > member. See
 * domain/auth/permissions.ts for the ranking and assignment rules; this enum
 * is the fast-path check every action/page guard uses directly, no join.
 */
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "manager", "member"]);

/**
 * `past_due` is a degrade, not a data-loss event — a company with a lapsed
 * payment method keeps every row it ever wrote, just loses write access until
 * resolved. See docs/saas-platform-architecture.md.
 */
export const companyStatusEnum = pgEnum("company_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "paused",
]);

/**
 * A fixed, small set checked against `plans.max_*` — an enum, not open text
 * like `propertyTypes`/`locations` elsewhere, because these are read by
 * application code (`application/billing/usage.ts`), not display labels for
 * scraped data. `datasets`/`seats` are enforced via a live `COUNT(*)` instead
 * of this table (see usage.ts) but keep enum entries for documentation
 * symmetry with the metrics that do use it.
 */
export const usageMetricEnum = pgEnum("usage_metric", [
  "datasets",
  "seats",
  "leads_this_month",
  /** Raw records ingested this month, across every source kind — the "data fetch limit." */
  "raw_records_month",
  /** Apify HTTP requests made this month — a distinct, infra-cost-driven metric from the above. */
  "apify_requests_month",
  /** Cumulative, not monthly-windowed (`periodStart` null) — total raw-record payload size on disk. */
  "storage_kb",
  /** LLM calls made this month (lead summaries + message drafts) — a metered-cost metric like `apify_requests_month`, capped by a fixed constant rather than a per-plan column since only one plan feature (`aiAssistant`) gates this today. See application/leads/ai-assist.actions.ts. */
  "ai_requests_month",
]);

/**
 * Data validation / lead scoring tier — `domain/scoring/lead-validation.ts`'s
 * `LeadPotential` union, persisted so the dashboard can filter/sort by it
 * without recomputing the composite score for every row on every request.
 * Recomputed at the same point `leadType`/`buyerScore`/etc are (see
 * `application/leads/identity-resolution.ts::recomputePersonRollup`) — same
 * "derived, freely regenerable" contract as the rest of the rollup.
 */
export const leadPotentialEnum = pgEnum("lead_potential", [
  "high_potential",
  "medium_potential",
  "low_potential",
]);

/**
 * The fixed, closed set of writes a Super Admin may perform against a
 * tenant's data — see `docs/multi-tenant-apify-isolation-plan.md` §3 and
 * `infrastructure/db/schema/platform.ts`'s `superAdminActions` table. An
 * enum, not free text: this list is a security boundary (everything a
 * platform operator is allowed to touch on someone else's tenant), so
 * adding a new one is a deliberate code change and migration, not a typo
 * away from a new capability.
 */
export const superAdminActionEnum = pgEnum("super_admin_action", ["extend_trial", "resend_invite"]);

/**
 * A category's visibility, not its existence — `active` shows at `/signup`'s
 * category picker, `beta` hides it from signup but leaves it usable (manually
 * created test tenants), `disabled` hides it from new signups without
 * touching any existing tenant already on it (`companies.categoryId` is
 * immutable post-signup — see `docs/domain.md`). See
 * `infrastructure/db/schema/categories.ts` for the table this belongs to.
 */
export const categoryConfigStatusEnum = pgEnum("category_config_status", ["active", "beta", "disabled"]);

/**
 * The closed set of writes a Super Admin may perform against platform
 * category configuration — the config-layer counterpart to
 * `superAdminActionEnum`, which covers writes against a specific *tenant*
 * instead. Kept as a separate enum/table (`platform_category_actions`)
 * rather than folded into `super_admin_actions` because these writes are
 * never company-scoped. `create_category`/`update_config` touch
 * `categories`; `update_lexicon` touches `category_lexicon_phrases` — split
 * out as its own action because it's the one write that directly changes
 * live scoring behavior, worth its own audit trail entry. See
 * `docs/platform-super-admin-flow.md` §0.
 */
export const platformCategoryActionEnum = pgEnum("platform_category_action", [
  "create_category",
  "update_config",
  "update_lexicon",
]);

export const leadEventTypeEnum = pgEnum("lead_event_type", [
  "created",
  "status_changed",
  "assigned",
  "note_added",
  "contacted",
  "alerted",
  "reclassified",
  "merged",
  /** The escape hatch for a `merged` event — see `application/leads/split-lead.ts`. Logged on both leads a split touches, `payload.direction` tells which side. */
  "split",
]);
