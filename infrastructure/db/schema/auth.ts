import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums";
import { companies } from "./company";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * One user belongs to exactly one company; `email` stays globally unique
     * (a deliberate simplification, not per-company) — see
     * docs/saas-platform-architecture.md.
     */
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: userRoleEnum("role").notNull().default("member"),
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
  (t) => [uniqueIndex("users_email_key").on(t.email), index("users_company_idx").on(t.companyId)],
);

export type UserRow = typeof users.$inferSelect;

/**
 * Extended, freely-editable account settings — split from `users` so the row
 * read on every authenticated request (`currentUser()`) stays narrow. No row
 * exists until the account owner edits their profile for the first time.
 */
export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  timezone: text("timezone").notNull().default("Asia/Makassar"),
  locale: text("locale").notNull().default("en"),
  jobTitle: text("job_title"),
  bio: text("bio"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProfileRow = typeof profiles.$inferSelect;

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

/**
 * Email-based team invite. `tokenHash` (sha256 of the random token embedded
 * in the invite link), never the raw token — same reasoning as never storing
 * a plaintext password, even though this token is high-entropy rather than
 * human-chosen. One row per invite send; re-inviting the same address issues
 * a new row rather than mutating this one, so an already-emailed link a
 * recipient is mid-click on never silently changes underneath them.
 */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invites_token_hash_key").on(t.tokenHash),
    index("invites_company_idx").on(t.companyId),
    index("invites_email_idx").on(t.email),
  ],
);

export type InviteRow = typeof invites.$inferSelect;

/**
 * Self-service "forgot password" token, separate from the admin-issued
 * `mustChangePassword` temporary-password path in `team.actions.ts` — that one
 * requires an admin to already be involved; this one lets a locked-out user
 * recover on their own via the email on file. `tokenHash` only, same reasoning
 * as `invites.tokenHash`. Single-use (`usedAt`), short-lived (`expiresAt`).
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_token_hash_key").on(t.tokenHash),
    index("password_reset_tokens_user_idx").on(t.userId),
  ],
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
