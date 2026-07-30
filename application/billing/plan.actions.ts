"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/infrastructure/db/client";
import type { PlanRow } from "@/infrastructure/db/schema/company";
import { ownerActionClient, ActionError } from "@/application/safe-action";
import { formatStorageKb } from "@/shared/format";
import { getUsageSummary } from "./usage";

/** Every plan, cheapest first — backs both the public pricing page and the admin plan picker. */
export async function listPlans() {
  return db().select().from(schema.plans).orderBy(schema.plans.monthlyPriceUsd);
}

export type PlanChangeValidation = { ok: true } | { ok: false; violations: string[] };

/**
 * The safety rule for an upgrade/downgrade: a plan switch is allowed iff
 * current usage already fits inside the *target* plan's limits. This needs
 * no explicit "is this an upgrade or a downgrade" concept — an upgrade only
 * raises limits, so it always passes; a downgrade is exactly the case this
 * check exists to catch.
 *
 * Only *stock* metrics are checked (seats, datasets, alert rules, storage —
 * quantities that exist right now and would be immediately over the new
 * ceiling). Monthly *flow* metrics (leads/raw-records/Apify-requests this
 * month) are deliberately not checked here: they're already-spent
 * consumption under the old plan's budget, not a standing violation — the
 * new, smaller monthly budget simply applies starting now, same as how a
 * real Stripe plan change works.
 *
 * Split out from the `changePlan` action so it's directly testable without a
 * request-scoped session (see `plan.actions.integration.test.ts`).
 */
export async function validatePlanChange(companyId: string, targetPlan: PlanRow): Promise<PlanChangeValidation> {
  const usage = await getUsageSummary(companyId);
  if (!usage) return { ok: false, violations: ["No usage data available for this company."] };

  const violations: string[] = [];
  if (targetPlan.maxSeats !== null && usage.seats.used > targetPlan.maxSeats) {
    violations.push(`${usage.seats.used} seats in use, ${targetPlan.name} allows ${targetPlan.maxSeats}`);
  }
  if (usage.datasets.used > targetPlan.maxDatasets) {
    violations.push(`${usage.datasets.used} datasets in use, ${targetPlan.name} allows ${targetPlan.maxDatasets}`);
  }
  if (targetPlan.maxAlertRules !== null && usage.alertRules.used > targetPlan.maxAlertRules) {
    violations.push(
      `${usage.alertRules.used} alert rules in use, ${targetPlan.name} allows ${targetPlan.maxAlertRules}`,
    );
  }
  if (usage.storageKb.used > targetPlan.maxStorageKb) {
    violations.push(
      `${formatStorageKb(usage.storageKb.used)} stored, ${targetPlan.name} allows ${formatStorageKb(targetPlan.maxStorageKb)}`,
    );
  }

  return violations.length > 0 ? { ok: false, violations } : { ok: true };
}

const changePlanSchema = z.object({ planId: z.string().uuid() });

/**
 * Upgrade/downgrade. Owner-only — this is a spend decision, not a "manage
 * users and settings" one (see `domain/auth/permissions.ts`'s role split).
 */
export const changePlan = ownerActionClient
  .inputSchema(changePlanSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [targetPlan] = await db()
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, parsedInput.planId))
      .limit(1);
    if (!targetPlan) throw new ActionError("Plan not found.");

    const [subscription] = await db()
      .select({ id: schema.subscriptions.id, planId: schema.subscriptions.planId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.companyId, ctx.user.companyId))
      .limit(1);
    if (!subscription) throw new ActionError("No subscription found for this company.");
    if (subscription.planId === targetPlan.id) {
      throw new ActionError(`Already on the ${targetPlan.name} plan.`);
    }

    const validation = await validatePlanChange(ctx.user.companyId, targetPlan);
    if (!validation.ok) {
      throw new ActionError(`Can't switch to ${targetPlan.name} — reduce usage first: ${validation.violations.join("; ")}`);
    }

    await db()
      .update(schema.subscriptions)
      .set({ planId: targetPlan.id, updatedAt: new Date() })
      .where(eq(schema.subscriptions.companyId, ctx.user.companyId));

    return { ok: true, planName: targetPlan.name };
  });
