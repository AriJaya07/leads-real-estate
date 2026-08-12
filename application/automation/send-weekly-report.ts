import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getLeadStats, getLeadTrend, getTopUncontactedLeads } from "@/application/leads/lead-queries";
import { getRevenueSummary } from "@/application/analytics/revenue";
import { getConversionFunnel } from "@/application/analytics/conversion";
import { primaryLeadScore } from "@/domain/lead/ranking";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";
import { getAutomationSettings } from "./automation-settings.queries";

const log = createLogger("automation:weekly-report");
const WEEK_MS = 7 * 86_400_000;

/**
 * Rendering (HTML/subject/copy) and sending both live in n8n workflow 09
 * (`n8n/workflows/notifications/09-weekly-report-render-and-send.json`) —
 * this app only computes the numbers, same source functions the dashboard
 * and Analytics page use, and hands them over raw. Unlike the `whatsapp`/
 * `slack` notifier channels this has no in-app fallback: an unconfigured
 * `N8N_WEEKLY_REPORT_WEBHOOK_URL` just means the digest doesn't go out,
 * logged as a warning, same "must never break the pipeline" posture as
 * every other notifier.
 */
async function postWeeklyReport(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const url = serverEnv().N8N_WEEKLY_REPORT_WEBHOOK_URL;
  const secret = serverEnv().AVERONAI_NOTIFY_SHARED_SECRET;
  if (!url || !secret) {
    return { ok: false, error: "N8N_WEEKLY_REPORT_WEBHOOK_URL/AVERONAI_NOTIFY_SHARED_SECRET not configured" };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-averonai-notify-secret": secret },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, error: `n8n weekly report ${response.status}: ${body}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface WeeklyReportResult {
  sent: boolean;
}

/**
 * A weekly digest of the same headline numbers the /leads dashboard and
 * /intelligence page already compute — `getLeadStats`/`getLeadTrend`, not a
 * second aggregate query. For a manager who doesn't open the dashboard daily,
 * not a replacement for it. Self-throttled to at most once every 7 days.
 */
export async function sendWeeklyReport(companyId: string, now: Date = new Date()): Promise<WeeklyReportResult> {
  const settings = await getAutomationSettings(companyId);
  if (!settings.weeklyReportEnabled) {
    return { sent: false };
  }
  if (settings.weeklyReportLastSentAt && now.getTime() - settings.weeklyReportLastSentAt.getTime() < WEEK_MS) {
    return { sent: false };
  }

  // No admin-typed list yet — fall back to every owner/admin on the company,
  // so enabling the digest actually reaches someone instead of silently
  // sending nothing until an admin fills in `weeklyReportRecipients` by hand.
  let recipients = settings.weeklyReportRecipients;
  if (recipients.length === 0) {
    const owners = await db()
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(and(eq(schema.users.companyId, companyId), inArray(schema.users.role, ["owner", "admin"])));
    recipients = owners.map((u) => u.email);
  }
  if (recipients.length === 0) return { sent: false };

  const [company] = await db()
    .select({ name: schema.companies.name })
    .from(schema.companies)
    .where(eq(schema.companies.id, companyId))
    .limit(1);

  const [stats, trend, revenue, funnel, topUncontacted] = await Promise.all([
    getLeadStats(companyId),
    getLeadTrend(companyId, undefined, 7),
    // `days: 7` here, despite the field names reading "...Last30Days" — the
    // same function backs both this weekly digest and the Analytics page's
    // 30-day default; the field names describe *that* default, not a fixed
    // window, and the value itself is always exactly the requested `days`.
    getRevenueSummary(companyId, 7),
    getConversionFunnel(companyId),
    getTopUncontactedLeads(companyId, 5),
  ]);
  const newThisWeek = trend.reduce((sum, point) => sum + point.total, 0);
  const companyName = company?.name ?? "AveronAi";
  const uncontacted = topUncontacted.map((lead) => ({
    name: lead.name || lead.username || "Unnamed lead",
    where: lead.locations[0] ?? lead.location ?? "",
    score: primaryLeadScore(lead),
  }));

  let anySent = false;
  for (const recipient of recipients) {
    const result = await postWeeklyReport({
      companyName,
      recipient,
      newThisWeek,
      stats: {
        total: stats.total,
        buyers: stats.buyers,
        hotBuyers: stats.hotBuyers,
        unassigned: stats.unassigned,
        contactable: stats.contactable,
        highPotential: stats.highPotential,
        highScore: stats.highScore,
        uncontactedOver2h: stats.uncontactedOver2h,
        medianTimeToFirstTouchMinutes: stats.medianTimeToFirstTouchMinutes,
      },
      revenue: { revenueLast30Days: revenue.revenueLast30Days, dealsLast30Days: revenue.dealsLast30Days },
      funnel: { overallConversionPct: funnel.overallConversionPct },
      topUncontacted: uncontacted,
    });
    if (result.ok) anySent = true;
    else log.warn("weekly report send failed", { companyId, recipient, error: result.error });
  }

  // Same reasoning as send-reminders.ts: the cooldown resets on every
  // attempt, not just a successful send, so an unconfigured mail provider
  // doesn't turn into a tight retry loop.
  await db()
    .update(schema.automationSettings)
    .set({ weeklyReportLastSentAt: now })
    .where(eq(schema.automationSettings.companyId, companyId));

  return { sent: anySent };
}
