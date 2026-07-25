import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    role: userRoleEnum("role").notNull().default("agent"),
    /** `scrypt$<salt>$<hash>`. Never a plaintext or reversible value. */
    passwordHash: text("password_hash"),
    passwordSetAt: timestamp("password_set_at", { withTimezone: true }),
    /** Forces a change on next sign-in after an admin-issued temporary password. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /** Agents opted out of the round-robin get no new assignments. */
    acceptsAssignments: boolean("accepts_assignments").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export type UserRow = typeof users.$inferSelect;
