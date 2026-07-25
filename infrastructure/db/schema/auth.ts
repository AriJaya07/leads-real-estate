import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    /**
     * Embedded in every session JWT at sign-in; `currentUser()` rejects a token
     * whose embedded version doesn't match this column. Bumped on password
     * change/reset and "sign out everywhere" — this is what makes a session
     * revocable at all, since the JWT itself is otherwise stateless and valid
     * until its own expiry regardless of what happens to the account afterward.
     */
    sessionVersion: integer("session_version").notNull().default(1),
    /** Agents opted out of the round-robin get no new assignments. */
    acceptsAssignments: boolean("accepts_assignments").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export type UserRow = typeof users.$inferSelect;

/**
 * One row per sign-in attempt, keyed by the email typed in — not by user id,
 * since a nonexistent-account attempt has no user id to key on and is exactly
 * the case throttling most needs to cover. Never pruned automatically; fine at
 * this app's login volume, see docs/tech-debt.md if that changes.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_created_idx").on(t.email, t.createdAt)],
);

export type LoginAttemptRow = typeof loginAttempts.$inferSelect;
