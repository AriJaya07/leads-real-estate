import "server-only";
import { createSafeActionClient } from "next-safe-action";
import { currentUser } from "@/application/auth/current-user";
import { roleAtLeast } from "@/domain/auth/permissions";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("action");

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

/** Public actions (login). No session required. */
export const actionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof ActionError) return error.message;
    log.error("unhandled server action error", { error });
    return "Something went wrong. Please try again.";
  },
});

/**
 * Every data-touching action goes through here — auth is re-verified server-side.
 *
 * Also blocks while a temporary password hasn't been changed yet
 * (`mustChangePassword`), mirroring the redirect in `requireUser()`. That
 * redirect alone isn't a security boundary — a client could still invoke a
 * server action directly against an already-rendered page — so the same rule
 * is enforced again here. `changePassword` is the one action that must work
 * regardless, so it uses `authActionClientAllowPendingPasswordChange` instead.
 */
export const authActionClient = actionClient.use(async ({ next }) => {
  const user = await currentUser();
  if (!user) throw new ActionError("You are signed out. Reload and sign in again.");
  if (user.mustChangePassword) {
    throw new ActionError("Change your temporary password before continuing.");
  }
  return next({ ctx: { user } });
});

/** Owner or admin — "manage users and settings." */
export const adminActionClient = authActionClient.use(async ({ next, ctx }) => {
  if (!roleAtLeast(ctx.user.role, "admin")) throw new ActionError("Admin access required.");
  return next({ ctx });
});

/** Owner, admin, or manager — "manage projects and data." */
export const managerActionClient = authActionClient.use(async ({ next, ctx }) => {
  if (!roleAtLeast(ctx.user.role, "manager")) throw new ActionError("Manager access required.");
  return next({ ctx });
});

/** Owner only — spend-affecting actions (changing the subscription plan) that no other role may take. */
export const ownerActionClient = authActionClient.use(async ({ next, ctx }) => {
  if (!roleAtLeast(ctx.user.role, "owner")) throw new ActionError("Owner access required.");
  return next({ ctx });
});

/**
 * Cross-company usage visibility — deliberately separate from the
 * role-hierarchy tiers above, same split as `requirePlatformAdmin()`
 * (`application/auth/current-user.ts`). A company `owner` does not pass
 * this. Every action gated here writes to `super_admin_actions`, never
 * directly to a tenant's leads/datasets/rules — see
 * `application/platform/tenant-actions.ts`.
 */
export const platformActionClient = authActionClient.use(async ({ next, ctx }) => {
  if (!ctx.user.isPlatformAdmin) throw new ActionError("Platform admin access required.");
  return next({ ctx });
});

/** Used only by `changePassword` — see the comment on `authActionClient`. */
export const authActionClientAllowPendingPasswordChange = actionClient.use(async ({ next }) => {
  const user = await currentUser();
  if (!user) throw new ActionError("You are signed out. Reload and sign in again.");
  return next({ ctx: { user } });
});
