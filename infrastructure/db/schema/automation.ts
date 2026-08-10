import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./company";
import { users } from "./auth";
import type { Predicate } from "@/domain/alerting/predicate";

/**
 * One row per company — a 1:1 settings extension, same shape as a profile
 * table, not a log. `companyId` is the primary key rather than a surrogate
 * `id` + unique index because there is, by definition, exactly one row per
 * company; upserts key on it directly (`onConflictDoUpdate`).
 *
 * A company with no row here (the common case until an admin visits
 * `/admin/automation`) has every automation off — `getAutomationSettings`
 * returns the same all-disabled defaults these columns default to, so "no
 * row" and "row with everything false" are deliberately indistinguishable to
 * every caller.
 */
export const automationSettings = pgTable("automation_settings", {
  companyId: uuid("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),

  /** Round-robins newly-unassigned leads across current company members — see application/automation/auto-assign.ts. */
  autoAssignEnabled: boolean("auto_assign_enabled").notNull().default(false),

  /** Digests leads that have sat untouched in an active pipeline status — see application/automation/send-reminders.ts. */
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderStaleDays: integer("reminder_stale_days").notNull().default(3),
  reminderRecipients: text("reminder_recipients").array().notNull().default(sql`'{}'::text[]`),
  reminderLastSentAt: timestamp("reminder_last_sent_at", { withTimezone: true }),

  /** Weekly aggregate performance email — see application/automation/send-weekly-report.ts. */
  weeklyReportEnabled: boolean("weekly_report_enabled").notNull().default(false),
  weeklyReportRecipients: text("weekly_report_recipients").array().notNull().default(sql`'{}'::text[]`),
  weeklyReportLastSentAt: timestamp("weekly_report_last_sent_at", { withTimezone: true }),

  /** Outbound lead events for CRM/Zapier-style sync — see infrastructure/webhooks/outbound-webhook.ts. */
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  webhookUrl: text("webhook_url"),
  /** HMAC-SHA256 signing secret for the `X-AveronAi-Signature` header — generated, not user-typed. */
  webhookSecret: text("webhook_secret"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationSettingsRow = typeof automationSettings.$inferSelect;

/**
 * One row per outbound-webhook attempt (initial send *and* every manual
 * retry) — `infrastructure/webhooks/outbound-webhook.ts::sendWebhook` itself
 * stays "single-attempt, best-effort, never throws"; this table is purely
 * the visibility layer on top, read by the API keys page's "Recent
 * deliveries" card. `payload` is stored so a retry can replay the exact same
 * body rather than reconstructing it from current lead state.
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    url: text("url").notNull(),
    payload: jsonb("payload").notNull(),
    ok: boolean("ok").notNull(),
    statusCode: integer("status_code"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_deliveries_company_idx").on(t.companyId, t.createdAt)],
);

export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;

export const automationRuleActionEnum = pgEnum("automation_rule_action", ["assign", "hide"]);

/**
 * WHEN/THEN routing rules — "a Buyer in Canggu goes to Agus", "Brokers stay
 * out of the inbox". Reuses the same `Predicate` JSON language and evaluator
 * as `alert_rules` (`domain/alerting/predicate.ts`) rather than inventing a
 * second condition DSL; only the action differs (notify vs. mutate lead
 * state). Evaluated by `application/automation/apply-automation-rules.ts`
 * from the same sync-pipeline hook alert/webhook dispatch already use.
 */
export const automationRules = pgTable(
  "automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    predicate: jsonb("predicate").$type<Predicate>().notNull(),
    action: automationRuleActionEnum("action").notNull(),
    /** Only meaningful when `action = 'assign'`. */
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** Lower runs first. Evaluation stops per-lead at the first matching rule, so order is the tie-breaker between overlapping conditions. */
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("automation_rules_company_idx").on(t.companyId, t.priority)],
);

export type AutomationRuleRow = typeof automationRules.$inferSelect;
