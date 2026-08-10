import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getLeadStats, getLeadTrend, getTopUncontactedLeads, type LeadStats, type LeadListItem } from "@/application/leads/lead-queries";
import { getRevenueSummary, type RevenueSummary } from "@/application/analytics/revenue";
import { getConversionFunnel, type ConversionFunnel } from "@/application/analytics/conversion";
import { primaryLeadScore } from "@/domain/lead/ranking";
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
  topUncontacted: LeadListItem[],
  recipient: string,
): NotificationMessage {
  const rows: [string, string][] = [
    ["New leads this week", formatCount(newThisWeek)],
    ["Total leads", formatCount(stats.total)],
    ["Buyers", `${formatCount(stats.buyers)} (${formatCount(stats.hotBuyers)} hot)`],
    ["Unassigned", formatCount(stats.unassigned)],
    ["Contactable", formatCount(stats.contactable)],
    ["High potential", formatCount(stats.highPotential)],
    ["High score (80+)", formatCount(stats.highScore)],
    ["Uncontacted 2h+", formatCount(stats.uncontactedOver2h)],
    [
      "Median time to first touch",
      stats.medianTimeToFirstTouchMinutes === null ? "no data yet" : formatMinutes(stats.medianTimeToFirstTouchMinutes),
    ],
    ["Revenue this week", `${formatUsd(revenue.revenueLast30Days)} (${formatCount(revenue.dealsLast30Days)} deals)`],
    ["Overall conversion to closed", `${funnel.overallConversionPct.toFixed(1)}%`],
  ];

  const uncontactedLines = topUncontacted.map((lead) => {
    const name = lead.name || lead.username || "Unnamed lead";
    const where = lead.locations[0] ?? lead.location ?? "";
    return { name, where, score: primaryLeadScore(lead) };
  });

  const subject = `Weekly lead report — ${formatCount(newThisWeek)} new this week`;
  const text = [
    `${companyName} — weekly lead report`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(uncontactedLines.length > 0
      ? ["", "Top leads you haven't touched:", ...uncontactedLines.map((l) => `- ${l.name} — ${l.where} (${l.score})`)]
      : []),
  ].join("\n");
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
      ${
        uncontactedLines.length > 0
          ? `
      <h3 style="font:600 13px/1.3 system-ui,sans-serif;margin:20px 0 8px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Top leads you haven't touched</h3>
      <table style="width:100%;border-collapse:collapse;font:400 14px/1.6 system-ui,sans-serif;">
        ${uncontactedLines
          .map(
            (l) => `
          <tr>
            <td style="padding:6px 0;border-bottom:1px solid #e6e6e6;">${l.name}${l.where ? ` — ${l.where}` : ""}</td>
            <td style="padding:6px 0;border-bottom:1px solid #e6e6e6;text-align:right;font-weight:600;">${l.score}</td>
          </tr>`,
          )
          .join("")}
      </table>`
          : ""
      }
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

  const notifier = getNotifier("email");
  let anySent = false;
  for (const recipient of recipients) {
    const message = renderWeeklyReport(company?.name ?? "AveronAi", stats, newThisWeek, revenue, funnel, topUncontacted, recipient);
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
