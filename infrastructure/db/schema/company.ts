import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companyStatusEnum, subscriptionStatusEnum, usageMetricEnum } from "./enums";
import { NO_PLAN_FEATURES, type PlanFeatures } from "@/domain/billing/plan-features";

/**
 * A tenant. Every business-data table in the schema carries a `companyId`
 * back to this table — see docs/saas-platform-architecture.md for the full
 * multi-tenancy design and docs/tech-debt.md for what's deliberately not
 * enforced yet (Postgres RLS — this pass is app-layer scoping only).
 */
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: companyStatusEnum("status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("companies_slug_key").on(t.slug)],
);

/**
 * A DB row, not a hardcoded tier — changing a limit is an admin edit, same
 * "config lives in the database" rule the rest of this codebase already
 * follows (see architecture.md). No Stripe fields populated yet (billing is
 * a deferred phase); `stripePriceId` exists now so wiring billing later is
 * additive, not a migration.
 *
 * `maxSeats`/`maxAlertRules` are nullable — `NULL` means unlimited, the
 * Enterprise tier's actual selling point for those two ("unlimited users").
 * The other limits stay `NOT NULL` even for Enterprise: they map to real
 * infra/API cost (Apify requests, storage, records fetched), so that tier
 * gets a high concrete ceiling instead of a true no-limit — see
 * docs/pricing-strategy.md.
 */
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Whole dollars, not cents — every price in docs/pricing-strategy.md is a round number; add a currency/cents column if that ever changes. */
  monthlyPriceUsd: integer("monthly_price_usd"),
  /** Total for the year (already discounted), not `monthlyPriceUsd * 12` — `null` means "no self-serve annual option," e.g. Enterprise (custom/contact sales). */
  annualPriceUsd: integer("annual_price_usd"),
  stripePriceId: text("stripe_price_id"),
  maxSeats: integer("max_seats"),
  maxDatasets: integer("max_datasets").notNull(),
  /** "Data fetch limit" — raw records ingested per month, every source kind. */
  maxRawRecordsPerMonth: integer("max_raw_records_per_month").notNull(),
  /** Unique leads identified per month (post-dedup) — a business-value metric, not a raw-volume one. */
  maxLeadsPerMonth: integer("max_leads_per_month").notNull(),
  maxAlertRules: integer("max_alert_rules"),
  /** Apify HTTP requests per month — separate from the data-fetch limit above (API-call volume, not record volume). */
  maxApifyRequestsPerMonth: integer("max_apify_requests_per_month").notNull(),
  /** `null` = unlimited/custom (Enterprise) — same convention as `maxSeats`/`maxAlertRules`. Enforced by `application/api-keys/rate-limiter.ts`, displayed on `/docs/api`. */
  apiRateLimitPerMinute: integer("api_rate_limit_per_minute"),
  apiRateLimitBurst: integer("api_rate_limit_burst"),
  maxStorageKb: integer("max_storage_kb").notNull(),
  dataRetentionDays: integer("data_retention_days").notNull(),
  features: jsonb("features").$type<PlanFeatures>().notNull().default(NO_PLAN_FEATURES),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Mirrors Stripe's subscription state — does not replace Stripe as the
 * system of record for payment/invoice history. No `providerCustomerId`/
 * `providerSubscriptionId` are populated by this phase; billing integration
 * is deferred (see docs/saas-platform-architecture.md's Phase 5).
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    provider: text("provider"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    status: subscriptionStatusEnum("status").notNull().default("trialing"),
    seats: integer("seats").notNull().default(1),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscriptions_company_key").on(t.companyId)],
);

/**
 * The one metric here that actually needs an aggregate table rather than a
 * live `COUNT(*)` — `leads_this_month`, checked from deep inside the
 * per-record ingestion loop where a date-ranged count would run per new
 * person. `datasets`/`seats` are enforced via a live count instead (see
 * application/billing/usage.ts) — both are small, infrequent, admin-driven
 * writes where the aggregate-table optimization isn't worth the drift risk.
 * `period_start`/`period_end` are null for those two (cumulative total, not
 * windowed); real month bounds for `leads_this_month`.
 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    metric: usageMetricEnum("metric").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    value: integer("value").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_counters_company_metric_period_key").on(t.companyId, t.metric, t.periodStart),
    index("usage_counters_company_idx").on(t.companyId),
  ],
);

export type CompanyRow = typeof companies.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type UsageCounterRow = typeof usageCounters.$inferSelect;
