import { index, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./company";
import { users } from "./auth";
import { superAdminActionEnum } from "./enums";

/**
 * Append-only audit log for every write a Super Admin makes against a
 * tenant — the enforcement mechanism behind the "read-only on tenant data;
 * only logged, reversible support actions" rule in
 * `docs/multi-tenant-apify-isolation-plan.md` §3. Every row here is a write
 * that bypassed the normal `adminActionClient`/`ownerActionClient` tenant
 * actions — see `application/platform/tenant-actions.ts`, the only module
 * allowed to insert here. Never deleted, never editable after the fact —
 * the record's whole value is being an unaltered log a tenant owner could
 * be shown if they asked "did anyone touch my account."
 */
export const superAdminActions = pgTable(
  "super_admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    platformAdminUserId: uuid("platform_admin_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    action: superAdminActionEnum("action").notNull(),
    /** Action-specific context — e.g. `{ days: 14 }` for extend_trial, `{ inviteId, email }` for resend_invite. Never lead/tenant business data. */
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("super_admin_actions_company_idx").on(t.companyId, t.createdAt),
    index("super_admin_actions_admin_idx").on(t.platformAdminUserId, t.createdAt),
  ],
);

export type SuperAdminActionRow = typeof superAdminActions.$inferSelect;
