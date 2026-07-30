/**
 * Fixed role hierarchy, pure on purpose (same reason `session-version.ts` and
 * `rate-limit.ts` are) — every place that needs to answer "can this role do
 * that" calls through here instead of comparing role strings inline, so the
 * ranking only lives in one place.
 *
 * Deliberately a flat rank, not the `roles`/`role_permissions` tables in
 * `infrastructure/db/schema/rbac.ts` — those are a schema-only extension point
 * for a future *custom* per-company role, additive on top of this fixed set,
 * not a replacement for it. See docs/saas-database-schema.md.
 */
export type Role = "owner" | "admin" | "manager" | "member";

export const ROLES: readonly Role[] = ["owner", "admin", "manager", "member"];

const RANK: Record<Role, number> = { member: 0, manager: 1, admin: 2, owner: 3 };

export function isRole(value: string): value is Role {
  return Object.hasOwn(RANK, value);
}

/** True when `role` has at least the privilege of `minimum` (owner outranks everything). */
export function roleAtLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

/**
 * Only an owner may grant or edit an owner. Everyone at admin-or-above may
 * assign the non-owner roles — prevents an admin from minting a peer that
 * outranks them.
 */
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  if (targetRole === "owner") return actorRole === "owner";
  return roleAtLeast(actorRole, "admin");
}
