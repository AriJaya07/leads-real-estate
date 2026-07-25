import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { leads } from "./leads";
import { alertChannelEnum, alertDeliveryStatusEnum } from "./enums";
import type { Predicate } from "@/domain/alerting/predicate";

/**
 * Priority rules as data. The CEO's "high-intent Bali buyer" cohort ships as a
 * seeded row, so tuning a threshold is an admin edit rather than a deploy.
 */
export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    predicate: jsonb("predicate").$type<Predicate>().notNull(),
    channels: alertChannelEnum("channels").array().notNull(),
    recipients: text("recipients").array().notNull().default([]),
    /** Suppress repeat sends for the same lead within this window. */
    throttleSeconds: integer("throttle_seconds").notNull().default(300),
    /** Batch into a digest instead of one message per lead above this rate. */
    digestThreshold: integer("digest_threshold").notNull().default(3),
    escalateAfterSeconds: integer("escalate_after_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alert_rules_name_key").on(t.name)],
);

/**
 * Delivery ledger. The unique `dedupeKey` is what stops a mapping-profile
 * backfill from re-alerting the entire history.
 */
export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertRuleId: uuid("alert_rule_id").references(() => alertRules.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    channel: alertChannelEnum("channel").notNull(),
    status: alertDeliveryStatusEnum("status").notNull().default("pending"),
    dedupeKey: text("dedupe_key").notNull(),
    recipient: text("recipient"),
    error: text("error"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("alert_deliveries_dedupe_key").on(t.dedupeKey),
    index("alert_deliveries_lead_idx").on(t.leadId),
    index("alert_deliveries_status_idx").on(t.status),
  ],
);

export type AlertRuleRow = typeof alertRules.$inferSelect;
export type AlertDeliveryRow = typeof alertDeliveries.$inferSelect;
