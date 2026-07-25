/** Fixed values that are not configuration — they never differ per deployment. */

export const APIFY_API_BASE_URL = "https://api.apify.com/v2";

export const SESSION_COOKIE_NAME = "dreamrue_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

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
