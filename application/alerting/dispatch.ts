import "server-only";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { evaluatePredicate } from "@/domain/alerting/predicate";
import { getNotifier } from "@/infrastructure/notifiers/registry";
import { getLeadsForDigest, type AlertableLead } from "@/application/leads/lead-queries";
import type { AlertRuleRow } from "@/infrastructure/db/schema/alerts";
import { renderLeadDigest } from "./digest-template";

export interface DispatchResult {
  evaluated: number;
  matched: number;
  sent: number;
  suppressed: number;
  ruleNames: string[];
}

/**
 * The shape alert predicates are evaluated against — the person-level rollup,
 * not any single appearance. `budgetMin`/`budgetMax` prefer the USD-normalized
 * value so a threshold like "$50k+" means the same thing regardless of which
 * currency a lead's most recent stated budget was in.
 */
function toSubject(lead: AlertableLead): Record<string, unknown> {
  return {
    leadType: lead.leadType,
    buyerScore: lead.buyerScore,
    sellerScore: lead.sellerScore,
    investorScore: lead.investorScore,
    confidenceScore: lead.confidenceScore,
    propertyTypes: lead.propertyTypes,
    locations: lead.locations,
    budgetMin: lead.budgetUsdMin ?? lead.budgetMin,
    budgetMax: lead.budgetUsdMax ?? lead.budgetMax,
    latestAppearanceAt: lead.latestAppearanceAt,
    hasContact: Boolean(lead.contact?.phone || lead.contact?.whatsapp || lead.contact?.email),
    name: lead.name,
  };
}

/**
 * Stable per (rule, lead, channel). The unique index on this column is what
 * stops a mapping-profile backfill from re-alerting the entire history —
 * without it, reprocessing would page the whole sales team about months-old posts.
 * Also what makes it safe to pass the same person id through this function
 * repeatedly across many appearances: the second and subsequent calls for an
 * already-alerted person just get suppressed here.
 */
function dedupeKey(ruleId: string, leadId: string, channel: string): string {
  return createHash("sha256").update(`${ruleId}:${leadId}:${channel}`).digest("hex").slice(0, 40);
}

async function claimDelivery(
  rule: AlertRuleRow,
  leadId: string,
  channel: string,
  recipient: string,
): Promise<string | null> {
  const [claimed] = await db()
    .insert(schema.alertDeliveries)
    .values({
      alertRuleId: rule.id,
      leadId,
      channel: channel as "email" | "whatsapp" | "slack" | "inapp",
      status: "pending",
      dedupeKey: dedupeKey(rule.id, leadId, channel),
      recipient,
    })
    .onConflictDoNothing({ target: schema.alertDeliveries.dedupeKey })
    .returning({ id: schema.alertDeliveries.id });

  return claimed?.id ?? null;
}

/**
 * Evaluates every enabled alert rule against newly touched leads (people, not
 * posts) and notifies the team. Called from the sync engine after each
 * processed batch, with the person ids whose rollup just changed.
 *
 * Alerts are batched into one digest per rule per run rather than one message
 * per lead: forty pings in five minutes gets the channel muted, and a muted
 * channel is worth nothing.
 */
export async function dispatchAlertsForLeads(leadIds: string[]): Promise<DispatchResult> {
  const result: DispatchResult = {
    evaluated: 0,
    matched: 0,
    sent: 0,
    suppressed: 0,
    ruleNames: [],
  };
  if (leadIds.length === 0) return result;

  const rules = await db()
    .select()
    .from(schema.alertRules)
    .where(eq(schema.alertRules.enabled, true));
  if (rules.length === 0) return result;

  const leads = await getLeadsForDigest(leadIds);
  result.evaluated = leads.length;

  const now = Date.now();

  for (const rule of rules) {
    const matched = leads.filter((lead) => evaluatePredicate(rule.predicate, toSubject(lead), now));
    if (matched.length === 0) continue;

    result.matched += matched.length;
    result.ruleNames.push(rule.name);

    for (const channel of rule.channels) {
      for (const recipient of rule.recipients) {
        const claimed: { deliveryId: string; lead: AlertableLead }[] = [];

        for (const lead of matched) {
          const deliveryId = await claimDelivery(rule, lead.id, channel, recipient);
          if (deliveryId) claimed.push({ deliveryId, lead });
          else result.suppressed += 1;
        }

        if (claimed.length === 0) continue;

        const notifier = getNotifier(channel);
        const message = renderLeadDigest(
          rule.name,
          claimed.map((c) => c.lead),
          recipient,
        );
        const sendResult = await notifier.send(message);

        await db()
          .update(schema.alertDeliveries)
          .set({
            status: sendResult.ok ? "sent" : "failed",
            error: sendResult.error ?? null,
            sentAt: sendResult.ok ? new Date() : null,
          })
          .where(
            inArray(
              schema.alertDeliveries.id,
              claimed.map((c) => c.deliveryId),
            ),
          );

        if (sendResult.ok) {
          result.sent += claimed.length;
          await db()
            .insert(schema.leadEvents)
            .values(
              claimed.map((c) => ({
                leadId: c.lead.id,
                type: "alerted" as const,
                payload: { rule: rule.name, channel, recipient },
              })),
            );
        }
      }
    }
  }

  return result;
}
