import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./company";
import { users } from "./auth";

/** Only `leads:read` is issuable today — see `application/api-keys/api-key.actions.ts`. The `leads:write` value exists so a future write endpoint is a code change, not a migration. */
export const apiKeyScopeEnum = pgEnum("api_key_scope", ["leads:read", "leads:write"]);

/**
 * A key's secret is never stored — only `keyHash` (sha256 hex of the full
 * `drk_live_…` secret). This is an *indexed equality lookup* among many keys
 * at request time (`application/api-keys/authenticate.ts`), not a
 * compare-against-one-known-secret like `secretsMatch()` — so a fast
 * deterministic hash is correct here, unlike password storage
 * (`infrastructure/auth/password.ts`'s slow, salted scrypt would make every
 * API request pay a deliberately-expensive hash for no security benefit).
 * `revokedAt` is a timestamp rather than a boolean so "when a key was
 * revoked" survives as an audit trail instead of being overwritten to a flag.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    /** First chars of the secret for display only, e.g. `drk_live_8fa2…` — never enough to reconstruct or brute-force the key. */
    keyPrefix: text("key_prefix").notNull(),
    scope: apiKeyScopeEnum("scope").notNull().default("leads:read"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("api_keys_key_hash_key").on(t.keyHash),
    index("api_keys_company_idx").on(t.companyId),
  ],
);

/**
 * Fixed-window counters backing `application/api-keys/rate-limiter.ts` — one
 * row per (key, window size, window start), incremented with an atomic
 * `onConflictDoUpdate`, same idiom `application/billing/usage.ts`'s monthly
 * counters already use, just with second-granularity windows instead of
 * calendar months. Two window sizes exist today (60s "per minute", 10s
 * "burst") — see `shared/constants.ts`. Rows are pruned by
 * `application/maintenance/prune-old-rows.ts`; nothing here needs to survive
 * past `API_KEY_RATE_COUNTER_RETENTION_HOURS`.
 */
export const apiKeyRateCounters = pgTable(
  "api_key_rate_counters",
  {
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    windowSeconds: integer("window_seconds").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.windowSeconds, t.windowStart] })],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type ApiKeyRateCounterRow = typeof apiKeyRateCounters.$inferSelect;
