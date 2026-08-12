"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import { allowedEmails } from "@/shared/config/env";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/infrastructure/auth/password";
import { ActionError, actionClient } from "@/application/safe-action";
import { TRIAL_DAYS, TRIAL_STARTER_PLAN_NAME } from "@/shared/constants";
import { startSession } from "./login.actions";

/** Postgres SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * A query run inside `db().transaction()` propagates the real Postgres error
 * (SQLSTATE `code`, `constraint_name`) nested under `.cause`, not directly on
 * the caught error — unlike a plain `.insert()` outside a transaction (see
 * `identity-resolution.ts`'s `isUniqueViolation`, which only ever needs the
 * top-level shape). Checking both here is what makes the retry-on-slug-collision
 * and the "email already has an account" message actually fire instead of
 * falling through to a generic "Something went wrong."
 */
function pgErrorField(error: unknown, field: "code" | "constraint_name"): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = (error as Record<string, unknown>)[field];
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const nested = (cause as Record<string, unknown>)[field];
    if (typeof nested === "string") return nested;
  }
  return undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return pgErrorField(error, "code") === UNIQUE_VIOLATION;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const signUpSchema = z.object({
  companyName: z.string().trim().min(1, "Enter a company name").max(200),
  categoryId: z.string().uuid(),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
});

/**
 * Creates a new company and its first (admin) user in one transaction, then
 * signs them in. Replaces the old single-instance "first sign-in claims
 * admin" bootstrap (`login.actions.ts`, removed) — a multi-tenant SaaS has no
 * single instance to claim, every company creates itself here.
 *
 * `AUTH_ALLOWED_EMAILS`, when set, is repurposed from "who can bootstrap the
 * instance" to "who can create a new company" — same env var, same
 * allowlist-of-addresses shape, one level up.
 */
export const signUp = actionClient.inputSchema(signUpSchema).action(async ({ parsedInput }) => {
  const { companyName, categoryId, email, password } = parsedInput;

  const allowed = allowedEmails();
  if (allowed.length > 0 && !allowed.includes(email)) {
    throw new ActionError("That address is not allowed to create a company. Check AUTH_ALLOWED_EMAILS.");
  }

  // Re-validated server-side, not trusted from the client's earlier fetch —
  // a category can flip to beta/disabled between the picker rendering and
  // this submit.
  const [category] = await db()
    .select({ id: schema.categories.id, status: schema.categories.status })
    .from(schema.categories)
    .where(eq(schema.categories.id, categoryId))
    .limit(1);
  if (!category || category.status === "disabled") {
    throw new ActionError("That category isn't available right now. Pick another.");
  }

  const baseSlug = slugify(companyName) || "company";
  const passwordHash = await hashPassword(password);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const created = await db().transaction(async (tx) => {
        const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

        const [company] = await tx
          .insert(schema.companies)
          .values({ name: companyName, slug, categoryId, status: "trialing", trialEndsAt })
          .returning();

        const [user] = await tx
          .insert(schema.users)
          .values({
            companyId: company.id,
            email,
            role: "owner",
            passwordHash,
            passwordSetAt: new Date(),
          })
          .returning();

        // Every company gets a real subscription row from the moment it
        // exists — `application/billing/usage.ts`'s limit checks all degrade
        // to "unenforced" when this is missing, which used to be silently
        // true for every new signup.
        const [starterPlan] = await tx
          .select({ id: schema.plans.id })
          .from(schema.plans)
          .where(eq(schema.plans.name, TRIAL_STARTER_PLAN_NAME))
          .limit(1);
        if (!starterPlan) {
          throw new ActionError(
            `No "${TRIAL_STARTER_PLAN_NAME}" plan configured. Run "npm run db:seed" to seed the standard plans.`,
          );
        }

        await tx.insert(schema.subscriptions).values({
          companyId: company.id,
          planId: starterPlan.id,
          status: "trialing",
          currentPeriodStart: new Date(),
          currentPeriodEnd: trialEndsAt,
        });

        return { company, user };
      });

      await startSession({
        id: created.user.id,
        email: created.user.email,
        role: created.user.role,
        sessionVersion: created.user.sessionVersion,
        companyId: created.company.id,
      });

      return { ok: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (pgErrorField(error, "constraint_name") === "users_email_key") {
        throw new ActionError("That email already has an account.");
      }
      // Otherwise it was a slug collision — retry with a disambiguated slug.
    }
  }

  throw new ActionError("Could not create your company. Try a different company name.");
});
