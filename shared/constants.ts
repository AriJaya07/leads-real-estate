/** Fixed values that are not configuration — they never differ per deployment. */

export const APIFY_API_BASE_URL = "https://api.apify.com/v2";

export const SESSION_COOKIE_NAME = "averonai_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

/** Every new company starts on a free trial of the Starter plan. See docs/pricing-strategy.md. */
export const TRIAL_DAYS = 14;
export const TRIAL_STARTER_PLAN_NAME = "Starter";

/** Ingest page size. Small enough to stay well inside a serverless invocation. */
export const SYNC_PAGE_SIZE = 500;
/** Hard ceiling per invocation; the cursor is committed per page so the next run resumes. */
export const SYNC_MAX_PAGES_PER_RUN = 20;

export const SCHEMA_SAMPLE_SIZE = 200;

export const DEFAULT_SYNC_INTERVAL_SECONDS = 900;
export const MIN_SYNC_INTERVAL_SECONDS = 120;
export const MAX_SYNC_INTERVAL_SECONDS = 6 * 60 * 60;

/**
 * Weekend is when consumers browse property, so datasets are polled harder.
 * Times are evaluated in Asia/Makassar (WITA), Bali's timezone.
 */
export const BALI_TIMEZONE = "Asia/Makassar";
export const WEEKEND_SYNC_MULTIPLIER = 0.5;

export const DATASET_STALE_MULTIPLIER = 3;
export const DATASET_FAILURE_THRESHOLD = 3;

/** Auto-flag a discovered field as facetable below this cardinality. */
export const FACETABLE_MAX_CARDINALITY = 40;
export const FACETABLE_MIN_FILL_RATE = 0.2;

/** Below this, an auto-generated mapping profile needs admin approval before use. */
export const MAPPING_AUTO_APPROVE_CONFIDENCE = 0.8;

export const NEAR_DUPLICATE_SIMILARITY = 0.9;
export const NEAR_DUPLICATE_WINDOW_HOURS = 72;

/**
 * Sanity check on the first batch a freshly auto-approved mapping profile
 * produces (an auto-approved profile has zero human review by design — see
 * docs/architecture.md's curated-beats-auto-proposal decision). Below this
 * sample size the check is skipped: a handful of records isn't enough to tell a
 * bad mapping from a genuinely spam-heavy source.
 */
export const MAPPING_QUALITY_MIN_SAMPLE = 5;
/** Above this spam rate in that first batch, the mapping is revoked for review. */
export const MAPPING_QUALITY_MAX_SPAM_RATE = 0.6;
/** Above this empty-body rate in that first batch, the mapping is revoked for review. */
export const MAPPING_QUALITY_MAX_EMPTY_BODY_RATE = 0.5;

/** Sign-in throttling window and threshold — see application/auth/login-attempts.ts. */
export const LOGIN_ATTEMPT_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILED_ATTEMPTS = 5;

/**
 * Retention for append-only tables nothing else prunes — see
 * application/maintenance/prune-old-rows.ts. `sync_runs` and `lead_events` are
 * deliberately not on this list: `sync_runs` backs historical admin log lookups
 * (`getDatasetDetail`), and `lead_events` is the funnel-analytics source of
 * truth, not disposable operational noise the way per-line sync logs and
 * failed-login rows are.
 */
export const SYNC_EVENTS_RETENTION_DAYS = 30;
export const LOGIN_ATTEMPTS_RETENTION_DAYS = 7;

/**
 * A repeated identical request (same template, same params) inside this window
 * reuses the still-in-flight/just-finished request instead of starting a second
 * Apify run — the "prevent unnecessary API usage" guard for the common case of a
 * double-click or an impatient retry. See `application/collection/scrape-requests.actions.ts`.
 */
export const SCRAPE_REQUEST_DEDUP_WINDOW_MINUTES = 15;

/** Curated defaults for the platform picker — the field itself stays free text, see collection.ts. */
export const SCRAPE_PLATFORMS = ["instagram", "facebook", "linkedin", "google_maps", "tiktok", "other"] as const;

/**
 * Monthly cap on AI-assist calls (lead summaries + message drafts) per
 * company — a flat safety net against a runaway loop or abusive usage
 * burning real Anthropic API spend, not a plan-tier limit (no plan currently
 * has its own `maxAiRequestsPerMonth` column; `aiAssistant` is a plain
 * on/off feature flag). Generous enough that no legitimate usage pattern
 * should ever hit it. See application/leads/ai-assist.actions.ts.
 */
export const MAX_AI_REQUESTS_PER_MONTH = 300;

/** The "burst" half of a plan's two-window API rate limit — see application/api-keys/rate-limiter.ts. */
export const API_KEY_RATE_LIMIT_BURST_WINDOW_SECONDS = 10;
/** How long a rate-limit counter window is kept once past — see application/maintenance/prune-old-rows.ts. */
export const API_KEY_RATE_COUNTER_RETENTION_HOURS = 1;
