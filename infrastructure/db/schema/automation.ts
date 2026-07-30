import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./company";

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
  /** HMAC-SHA256 signing secret for the `X-DreamRue-Signature` header — generated, not user-typed. */
  webhookSecret: text("webhook_secret"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationSettingsRow = typeof automationSettings.$inferSelect;
