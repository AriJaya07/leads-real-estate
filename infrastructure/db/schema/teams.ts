import { index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./company";
import { users } from "./auth";

/**
 * A sub-grouping *within* a company — a different, additional concept from
 * `/admin/team`'s existing company-wide user roster
 * (`application/auth/team.actions.ts`), which already owns the word "team"
 * for that. This is for a company large enough to want "Sales Team Bali" vs
 * "Sales Team Jakarta" as separately manageable units. Nothing else in this
 * schema requires a `team_id` — leads/datasets/alert rules all stay scoped
 * to `company_id`, never `team_id`. See docs/saas-database-schema.md.
 */
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("teams_company_name_key").on(t.companyId, t.name),
    index("teams_company_idx").on(t.companyId),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleInTeam: text("role_in_team").notNull().default("member"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

export type TeamRow = typeof teams.$inferSelect;
export type TeamMemberRow = typeof teamMembers.$inferSelect;
