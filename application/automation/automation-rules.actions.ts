"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient, ActionError } from "@/application/safe-action";
import { automationRulesTag } from "@/application/cache-tags";
import { buildAllOfPredicate, type Comparison } from "@/domain/alerting/predicate";

/**
 * Deliberately narrower than the alert-rule builder's generic condition
 * editor: the doc's own examples are all "intent + area" ("a Buyer in
 * Canggu", "Brokers"), so the form only offers `leadType`/`locations` rather
 * than every field `evaluatePredicate` can technically compare. Still stored
 * as a real `Predicate` (an `all` of `in` comparisons), so a future pass can
 * widen the form without touching the storage shape or the evaluator.
 */
const automationRuleInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    leadTypes: z.array(z.enum(schema.leadTypeEnum.enumValues)).default([]),
    locations: z.array(z.string().trim().min(1).max(120)).default([]),
    action: z.enum(schema.automationRuleActionEnum.enumValues),
    assigneeId: z.string().uuid().optional(),
    priority: z.coerce.number().int().min(0).max(1000).default(0),
  })
  .refine((v) => v.leadTypes.length > 0 || v.locations.length > 0, {
    message: "Add at least one condition.",
    path: ["leadTypes"],
  })
  .refine((v) => v.action !== "assign" || Boolean(v.assigneeId), {
    message: "Choose who to assign matching leads to.",
    path: ["assigneeId"],
  });

function toPredicate(input: z.infer<typeof automationRuleInput>) {
  const conditions: Comparison[] = [];
  if (input.leadTypes.length > 0) conditions.push({ field: "leadType", op: "in", value: input.leadTypes });
  if (input.locations.length > 0) conditions.push({ field: "locations", op: "intersects", value: input.locations });
  return buildAllOfPredicate(conditions);
}

/**
 * Same tenant check `assignLead` (`application/leads/lead.actions.ts`) does
 * before writing `assignedTo` — this is a second, independent writer of that
 * same column via `applyAutomationRules`, and without this check a UUID for
 * a user in a different company would silently become a valid assignee.
 */
async function assertAssigneeInCompany(assigneeId: string, companyId: string): Promise<void> {
  const [assignee] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, assigneeId), eq(schema.users.companyId, companyId)))
    .limit(1);
  if (!assignee) throw new ActionError("That teammate was not found.");
}

export const createAutomationRule = adminActionClient
  .inputSchema(automationRuleInput)
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.action === "assign" && parsedInput.assigneeId) {
      await assertAssigneeInCompany(parsedInput.assigneeId, ctx.user.companyId);
    }

    const [created] = await db()
      .insert(schema.automationRules)
      .values({
        companyId: ctx.user.companyId,
        name: parsedInput.name,
        enabled: parsedInput.enabled,
        predicate: toPredicate(parsedInput),
        action: parsedInput.action,
        assigneeId: parsedInput.action === "assign" ? (parsedInput.assigneeId ?? null) : null,
        priority: parsedInput.priority,
      })
      .returning({ id: schema.automationRules.id });

    updateTag(automationRulesTag());
    return { id: created.id };
  });

export const updateAutomationRule = adminActionClient
  .inputSchema(automationRuleInput.extend({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.action === "assign" && parsedInput.assigneeId) {
      await assertAssigneeInCompany(parsedInput.assigneeId, ctx.user.companyId);
    }

    const [updated] = await db()
      .update(schema.automationRules)
      .set({
        name: parsedInput.name,
        enabled: parsedInput.enabled,
        predicate: toPredicate(parsedInput),
        action: parsedInput.action,
        assigneeId: parsedInput.action === "assign" ? (parsedInput.assigneeId ?? null) : null,
        priority: parsedInput.priority,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.automationRules.id, parsedInput.id), eq(schema.automationRules.companyId, ctx.user.companyId)))
      .returning({ id: schema.automationRules.id });
    if (!updated) throw new ActionError("Automation rule not found.");

    updateTag(automationRulesTag());
    return { ok: true };
  });

export const setAutomationRuleEnabled = adminActionClient
  .inputSchema(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    const [updated] = await db()
      .update(schema.automationRules)
      .set({ enabled: parsedInput.enabled, updatedAt: new Date() })
      .where(and(eq(schema.automationRules.id, parsedInput.id), eq(schema.automationRules.companyId, ctx.user.companyId)))
      .returning({ id: schema.automationRules.id });
    if (!updated) throw new ActionError("Automation rule not found.");

    updateTag(automationRulesTag());
    return { ok: true };
  });

export const deleteAutomationRule = adminActionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [deleted] = await db()
      .delete(schema.automationRules)
      .where(and(eq(schema.automationRules.id, parsedInput.id), eq(schema.automationRules.companyId, ctx.user.companyId)))
      .returning({ id: schema.automationRules.id });
    if (!deleted) throw new ActionError("Automation rule not found.");

    updateTag(automationRulesTag());
    return { ok: true };
  });
