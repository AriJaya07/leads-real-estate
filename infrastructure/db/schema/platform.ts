import { index, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./company";
import { users } from "./auth";
import { categories } from "./categories";
import { actorTemplates } from "./collection";
import { platformCategoryActionEnum, platformSourceActionEnum, superAdminActionEnum } from "./enums";

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

/**
 * Append-only audit log for `categories`/`category_lexicon_phrases` writes —
 * the config-layer counterpart to `superAdminActions` above, kept as a
 * separate table because these writes are never company-scoped. See
 * `docs/platform-super-admin-flow.md` §0 and `infrastructure/db/schema/categories.ts`.
 */
export const platformCategoryActions = pgTable(
  "platform_category_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platformAdminUserId: uuid("platform_admin_user_id").references(() => users.id, { onDelete: "set null" }),
    action: platformCategoryActionEnum("action").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("platform_category_actions_category_idx").on(t.categoryId, t.createdAt)],
);

export type PlatformCategoryActionRow = typeof platformCategoryActions.$inferSelect;

/**
 * Append-only audit log for Super Admin writes against the global
 * `actor_templates` catalog (`/platform/sources`) — the source-registry
 * counterpart to `platformCategoryActions` above, same "never company-scoped"
 * reasoning. `actorTemplateId` is nullable because `register_actor` logs
 * before a row exists to reference in the common case (the insert and the
 * audit row aren't in the same transaction) — the id still lands in `details`.
 */
export const platformSourceActions = pgTable(
  "platform_source_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platformAdminUserId: uuid("platform_admin_user_id").references(() => users.id, { onDelete: "set null" }),
    action: platformSourceActionEnum("action").notNull(),
    actorTemplateId: uuid("actor_template_id").references(() => actorTemplates.id, { onDelete: "set null" }),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("platform_source_actions_actor_template_idx").on(t.actorTemplateId, t.createdAt)],
);

export type PlatformSourceActionRow = typeof platformSourceActions.$inferSelect;
