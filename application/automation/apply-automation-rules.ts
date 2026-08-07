import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { evaluatePredicate } from "@/domain/alerting/predicate";
import { getLeadsForDigest } from "@/application/leads/lead-queries";
import { toSubject } from "@/application/alerting/dispatch";
import type { AutomationRuleRow } from "@/infrastructure/db/schema/automation";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("automation:rules");

export interface ApplyAutomationRulesResult {
  hidden: number;
  assigned: number;
}

/**
 * Evaluates every enabled automation rule (WHEN a lead matches, THEN
 * assign/hide) against newly touched leads, in priority order, and applies
 * the first match per lead per action kind. Called from the same
 * sync-pipeline hook `dispatchAlertsForLeads`/`dispatchWebhooksForLeads`
 * already use, so a rule fires the moment a lead is created or re-scored —
 * never throws, matching that same "must not break ingestion" posture.
 *
 * "Assign" only ever fills in a lead nobody has touched yet (`assignedTo IS
 * NULL`) — it never overwrites a human's manual (re)assignment. "Hide" is a
 * one-way flip: it never un-hides a lead a rule previously hid, even if a
 * later rule change means it would no longer match — an admin toggling a
 * rule off shouldn't silently repopulate everyone's inbox with leads they
 * already triaged out.
 */
export async function applyAutomationRules(companyId: string, leadIds: string[]): Promise<ApplyAutomationRulesResult> {
  const result: ApplyAutomationRulesResult = { hidden: 0, assigned: 0 };
  if (leadIds.length === 0) return result;

  try {
    const rules = await db()
      .select()
      .from(schema.automationRules)
      .where(and(eq(schema.automationRules.enabled, true), eq(schema.automationRules.companyId, companyId)))
      .orderBy(schema.automationRules.priority);
    if (rules.length === 0) return result;

    const leads = await getLeadsForDigest(companyId, leadIds);
    if (leads.length === 0) return result;

    const states = await db()
      .select({ leadId: schema.leadStates.leadId, assignedTo: schema.leadStates.assignedTo })
      .from(schema.leadStates)
      .where(inArray(schema.leadStates.leadId, leads.map((l) => l.id)));
    const assignedToByLead = new Map(states.map((s) => [s.leadId, s.assignedTo]));

    const toHide: string[] = [];
    const toAssign = new Map<string, string>();

    for (const lead of leads) {
      const subject = toSubject(lead);
      let hideMatch: AutomationRuleRow | undefined;
      let assignMatch: AutomationRuleRow | undefined;

      for (const rule of rules) {
        if (hideMatch && assignMatch) break;
        if (!evaluatePredicate(rule.predicate, subject)) continue;
        if (rule.action === "hide") hideMatch ??= rule;
        else if (rule.action === "assign") assignMatch ??= rule;
      }

      if (hideMatch) toHide.push(lead.id);
      if (assignMatch?.assigneeId && !assignedToByLead.get(lead.id)) {
        toAssign.set(lead.id, assignMatch.assigneeId);
      }
    }

    if (toHide.length > 0) {
      await db()
        .update(schema.leadStates)
        .set({ hidden: true })
        .where(inArray(schema.leadStates.leadId, toHide));
      result.hidden = toHide.length;
    }

    for (const [leadId, userId] of toAssign) {
      await db()
        .update(schema.leadStates)
        .set({ assignedTo: userId, updatedAt: new Date() })
        .where(and(eq(schema.leadStates.leadId, leadId), isNull(schema.leadStates.assignedTo)));
    }
    result.assigned = toAssign.size;
  } catch (error) {
    log.warn("automation rule evaluation failed", {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return result;
}
