"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient, ActionError } from "@/application/safe-action";
import { alertRulesTag } from "@/application/cache-tags";
import { buildAllOfPredicate, type Comparison, type ComparisonOp } from "@/domain/alerting/predicate";
import { CONDITION_FIELDS, CONDITION_OPS, RULE_CHANNELS } from "@/domain/alerting/rule-fields";

const conditionSchema = z.object({
  field: z.enum(CONDITION_FIELDS),
  op: z.enum(CONDITION_OPS as [ComparisonOp, ...ComparisonOp[]]),
  value: z.unknown(),
});

const alertRuleInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().default(true),
  channels: z.array(z.enum(RULE_CHANNELS)).min(1, "Select at least one channel."),
  // One shared recipient list applied to every selected channel — matches
  // `dispatch.ts`'s delivery loop, which pairs every channel with every recipient.
  recipients: z.array(z.string().trim().min(1).max(200)).min(1, "Add at least one recipient."),
  conditions: z.array(conditionSchema).min(1, "Add at least one condition."),
});

function toPredicate(conditions: z.infer<typeof conditionSchema>[]) {
  return buildAllOfPredicate(conditions as Comparison[]);
}

export const createAlertRule = adminActionClient
  .inputSchema(alertRuleInput)
  .action(async ({ parsedInput, ctx }) => {
    const [created] = await db()
      .insert(schema.alertRules)
      .values({
        companyId: ctx.user.companyId,
        name: parsedInput.name,
        description: parsedInput.description ?? null,
        enabled: parsedInput.enabled,
        predicate: toPredicate(parsedInput.conditions),
        channels: parsedInput.channels,
        recipients: parsedInput.recipients,
      })
      .onConflictDoNothing({ target: [schema.alertRules.companyId, schema.alertRules.name] })
      .returning({ id: schema.alertRules.id });
    if (!created) throw new ActionError(`An alert rule named "${parsedInput.name}" already exists.`);

    updateTag(alertRulesTag());
    return { id: created.id };
  });

export const updateAlertRule = adminActionClient
  .inputSchema(alertRuleInput.extend({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [updated] = await db()
      .update(schema.alertRules)
      .set({
        name: parsedInput.name,
        description: parsedInput.description ?? null,
        enabled: parsedInput.enabled,
        predicate: toPredicate(parsedInput.conditions),
        channels: parsedInput.channels,
        recipients: parsedInput.recipients,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.alertRules.id, parsedInput.id), eq(schema.alertRules.companyId, ctx.user.companyId)))
      .returning({ id: schema.alertRules.id });
    if (!updated) throw new ActionError("Alert rule not found.");

    updateTag(alertRulesTag());
    return { ok: true };
  });

export const setAlertRuleEnabled = adminActionClient
  .inputSchema(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    const [updated] = await db()
      .update(schema.alertRules)
      .set({ enabled: parsedInput.enabled, updatedAt: new Date() })
      .where(and(eq(schema.alertRules.id, parsedInput.id), eq(schema.alertRules.companyId, ctx.user.companyId)))
      .returning({ id: schema.alertRules.id });
    if (!updated) throw new ActionError("Alert rule not found.");

    updateTag(alertRulesTag());
    return { ok: true };
  });

export const deleteAlertRule = adminActionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [deleted] = await db()
      .delete(schema.alertRules)
      .where(and(eq(schema.alertRules.id, parsedInput.id), eq(schema.alertRules.companyId, ctx.user.companyId)))
      .returning({ id: schema.alertRules.id });
    if (!deleted) throw new ActionError("Alert rule not found.");

    updateTag(alertRulesTag());
    return { ok: true };
  });
