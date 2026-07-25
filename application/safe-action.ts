import "server-only";
import { createSafeActionClient } from "next-safe-action";
import { currentUser } from "@/application/auth/current-user";

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
    console.error("[action]", error);
    return "Something went wrong. Please try again.";
  },
});

/** Every data-touching action goes through here — auth is re-verified server-side. */
export const authActionClient = actionClient.use(async ({ next }) => {
  const user = await currentUser();
  if (!user) throw new ActionError("You are signed out. Reload and sign in again.");
  return next({ ctx: { user } });
});

export const adminActionClient = authActionClient.use(async ({ next, ctx }) => {
  if (ctx.user.role !== "admin") throw new ActionError("Admin access required.");
  return next({ ctx });
});
