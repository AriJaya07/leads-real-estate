import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getLeadsForDigest } from "@/application/leads/lead-queries";
import { renderLeadDigest } from "@/application/alerting/digest-template";
import { getNotifier } from "@/infrastructure/notifiers/registry";
import { textArray } from "@/application/leads/sql-helpers";
import { createLogger } from "@/infrastructure/observability/logger";
import { getAutomationSettings } from "./automation-settings.queries";

const log = createLogger("automation:reminders");
const DAY_MS = 86_400_000;
const MAX_LEADS_PER_DIGEST = 25;

/**
 * Deliberately excludes `new` (never touched — already the top of the
 * default triage view, a reminder would just be noise) and `closed`/`rejected`
 * (done, nothing to remind about). This is exactly the "started but went
 * quiet" gap the north-star metric doesn't otherwise catch: time-to-first-touch
 * only measures the *first* contact.
 */
const ACTIVE_PIPELINE_STATUSES = ["contacted", "qualified", "interested", "negotiation"] as const;

export interface ReminderResult {
  remindedLeadCount: number;
  sent: boolean;
}

/**
 * Digests leads that have sat in an active pipeline status without any
 * `lead_states` change (status/notes/assignment) for `reminderStaleDays`.
 * Reuses the exact same digest renderer and notifier registry the "new hot
 * lead" alert path uses — this is a different trigger condition (elapsed
 * time, not a fresh sync batch), not a different delivery mechanism.
 *
 * Self-throttling: won't send again until at least `reminderStaleDays` have
 * passed since the last send, so a sweep running more often than that
 * doesn't re-notify the same backlog every tick.
 */
export async function sendStaleLeadReminders(companyId: string, now: Date = new Date()): Promise<ReminderResult> {
  const settings = await getAutomationSettings(companyId);
  if (!settings.reminderEnabled || settings.reminderRecipients.length === 0) {
    return { remindedLeadCount: 0, sent: false };
  }

  if (settings.reminderLastSentAt) {
    const elapsedMs = now.getTime() - settings.reminderLastSentAt.getTime();
    if (elapsedMs < settings.reminderStaleDays * DAY_MS) return { remindedLeadCount: 0, sent: false };
  }

  const cutoff = new Date(now.getTime() - settings.reminderStaleDays * DAY_MS);

  const stale = await db()
    .select({ leadId: schema.leadStates.leadId })
    .from(schema.leadStates)
    .where(
      and(
        eq(schema.leadStates.companyId, companyId),
        sql`${schema.leadStates.status}::text = ANY(${textArray([...ACTIVE_PIPELINE_STATUSES])})`,
        lt(schema.leadStates.updatedAt, cutoff),
      ),
    )
    .orderBy(schema.leadStates.updatedAt)
    .limit(MAX_LEADS_PER_DIGEST);

  if (stale.length === 0) return { remindedLeadCount: 0, sent: false };

  const leads = await getLeadsForDigest(
    companyId,
    stale.map((s) => s.leadId),
  );
  if (leads.length === 0) return { remindedLeadCount: 0, sent: false };

  const notifier = getNotifier("email");
  let anySent = false;
  for (const recipient of settings.reminderRecipients) {
    const message = renderLeadDigest(`Stale lead reminder — ${settings.reminderStaleDays}+ days untouched`, leads, recipient);
    const result = await notifier.send(message);
    if (result.ok) anySent = true;
    else log.warn("reminder send failed", { companyId, recipient, error: result.error });
  }

  // The cooldown resets on every *attempt*, not just a successful send — an
  // unconfigured/down mail provider must not turn this into a tight retry
  // loop every sweep. Whether these leads are still stale hasn't changed just
  // because delivery failed; that's a notifier problem, not a re-query one.
  await db()
    .update(schema.automationSettings)
    .set({ reminderLastSentAt: now })
    .where(eq(schema.automationSettings.companyId, companyId));

  return { remindedLeadCount: leads.length, sent: anySent };
}
