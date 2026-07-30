import { sql } from "drizzle-orm";
import { boolean, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./company";
import { users } from "./auth";

/**
 * Schema-only extension point, deliberately not enforced anywhere yet.
 * `users.role` (admin|agent) stays the fast-path check every existing action
 * and page guard already uses — a single enum comparison, no join. This
 * layer exists for *custom* per-company roles later (e.g. a hand-picked
 * permission set for "Sales Manager"), additive on top of `users.role`, not
 * a replacement for it. See docs/saas-database-schema.md.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null = a system role (e.g. "owner"), shared across every company. */
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Two partial indexes, not one plain composite — Postgres treats every
    // NULL as distinct in a plain unique index, so a bare
    // `unique(company_id, name)` would silently let "owner" be inserted
    // twice as a system role (company_id NULL never conflicts with itself).
    uniqueIndex("roles_company_name_key").on(t.companyId, t.name).where(sql`${t.companyId} IS NOT NULL`),
    uniqueIndex("roles_system_name_key").on(t.name).where(sql`${t.companyId} IS NULL`),
  ],
);

/**
 * A fixed reference catalog (resource, action) pairs — e.g. `leads`/`read`,
 * `datasets`/`manage`. Plain text, not enums: an open vocabulary, same
 * reasoning as `propertyTypes`/`locations` elsewhere in this schema — a new
 * resource type shouldn't need a migration.
 */
export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
    description: text("description"),
  },
  (t) => [uniqueIndex("permissions_resource_action_key").on(t.resource, t.action)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export type RoleRow = typeof roles.$inferSelect;
export type PermissionRow = typeof permissions.$inferSelect;
