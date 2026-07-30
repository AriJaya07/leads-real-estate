import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getLeadStats, getLeadTrend, type LeadStats } from "@/application/leads/lead-queries";
import { getRevenueSummary, type RevenueSummary } from "@/application/analytics/revenue";
import { getConversionFunnel, type ConversionFunnel } from "@/application/analytics/conversion";
import { getNotifier } from "@/infrastructure/notifiers/registry";
import type { NotificationMessage } from "@/domain/sync/ports";
import { formatCount, formatMinutes, formatUsd } from "@/shared/format";
import { createLogger } from "@/infrastructure/observability/logger";
import { getAutomationSettings } from "./automation-settings.queries";

const log = createLogger("automation:weekly-report");
const WEEK_MS = 7 * 86_400_000;

function renderWeeklyReport(
  companyName: string,
  stats: LeadStats,
  newThisWeek: number,
  revenue: RevenueSummary,
  funnel: ConversionFunnel,
  recipient: string,
): NotificationMessage {
  const rows: [string, string][] = [
    ["New leads this week", formatCount(newThisWeek)],
    ["Total leads", formatCount(stats.total)],
    ["Buyers", `${formatCount(stats.buyers)} (${formatCount(stats.hotBuyers)} hot)`],
    ["Unassigned", formatCount(stats.unassigned)],
    ["Contactable", formatCount(stats.contactable)],
    ["High potential", formatCount(stats.highPotential)],
    [
      "Median time to first touch",
      stats.medianTimeToFirstTouchMinutes === null ? "no data yet" : formatMinutes(stats.medianTimeToFirstTouchMinutes),
    ],
    ["Revenue this week", `${formatUsd(revenue.revenueLast30Days)} (${formatCount(revenue.dealsLast30Days)} deals)`],
    ["Overall conversion to closed", `${funnel.overallConversionPct.toFixed(1)}%`],
  ];

  const subject = `Weekly lead report — ${formatCount(newThisWeek)} new this week`;
  const text = [`${companyName} — weekly lead report`, "", ...rows.map(([label, value]) => `${label}: ${value}`)].join(
    "\n",
  );
  const html = `
    <div style="max-width:480px;margin:0 auto;font-family:system-ui,sans-serif;">
      <h2 style="font:600 18px/1.3 system-ui,sans-serif;margin:0 0 12px;">${companyName} — weekly lead report</h2>
      <table style="width:100%;border-collapse:collapse;font:400 14px/1.6 system-ui,sans-serif;">
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding:6px 0;border-bottom:1px solid #e6e6e6;color:#6b7280;">${label}</td>
            <td style="padding:6px 0;border-bottom:1px solid #e6e6e6;text-align:right;font-weight:600;">${value}</td>
          </tr>`,
          )
          .join("")}
      </table>
    </div>`;

  return { to: recipient, subject, text, html };
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
  if (!settings.weeklyReportEnabled || settings.weeklyReportRecipients.length === 0) {
    return { sent: false };
  }
  if (settings.weeklyReportLastSentAt && now.getTime() - settings.weeklyReportLastSentAt.getTime() < WEEK_MS) {
    return { sent: false };
  }

  const [company] = await db()
    .select({ name: schema.companies.name })
    .from(schema.companies)
    .where(eq(schema.companies.id, companyId))
    .limit(1);

  const [stats, trend, revenue, funnel] = await Promise.all([
    getLeadStats(companyId),
    getLeadTrend(companyId, undefined, 7),
    // `days: 7` here, despite the field names reading "...Last30Days" — the
    // same function backs both this weekly digest and the Analytics page's
    // 30-day default; the field names describe *that* default, not a fixed
    // window, and the value itself is always exactly the requested `days`.
    getRevenueSummary(companyId, 7),
    getConversionFunnel(companyId),
  ]);
  const newThisWeek = trend.reduce((sum, point) => sum + point.total, 0);

  const notifier = getNotifier("email");
  let anySent = false;
  for (const recipient of settings.weeklyReportRecipients) {
    const message = renderWeeklyReport(company?.name ?? "DreamRue", stats, newThisWeek, revenue, funnel, recipient);
    const result = await notifier.send(message);
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
