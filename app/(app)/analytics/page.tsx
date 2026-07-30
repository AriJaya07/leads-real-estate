import type { Metadata } from "next";
import { requireManager } from "@/application/auth/current-user";
import { getLeadStats } from "@/application/leads/lead-queries";
import {
  getCachedConversionFunnel,
  getCachedSourcePerformance,
  getCachedAgentPerformance,
  getCachedRevenueSummary,
  getCachedActivityTrend,
} from "@/application/analytics/cached";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { ConversionFunnelChart } from "@/features/analytics/components/conversion-funnel-chart";
import { MetricTrendChart } from "@/features/analytics/components/metric-trend-chart";
import { SourcePerformanceTable } from "@/features/analytics/components/source-performance-table";
import { AgentPerformanceTable } from "@/features/analytics/components/agent-performance-table";
import { formatCount, formatMinutes, formatUsd } from "@/shared/format";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const user = await requireManager();

  const [stats, funnel, sources, agents, revenue, activity] = await Promise.all([
    getLeadStats(user.companyId),
    getCachedConversionFunnel(user.companyId),
    getCachedSourcePerformance(user.companyId),
    getCachedAgentPerformance(user.companyId),
    getCachedRevenueSummary(user.companyId),
    getCachedActivityTrend(user.companyId, 30),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Analytics"
        description="Conversion, source and agent performance, and revenue — the business-outcome half of the picture; see Intelligence for market-signal trends."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Total revenue"
          value={formatUsd(revenue.totalRevenueUsd)}
          hint={`${formatCount(revenue.closedDealCount)} closed deal${revenue.closedDealCount === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Revenue (30d)"
          value={formatUsd(revenue.revenueLast30Days)}
          hint={`${formatCount(revenue.dealsLast30Days)} deal${revenue.dealsLast30Days === 1 ? "" : "s"}`}
        />
        <StatTile label="Avg deal size" value={revenue.avgDealValueUsd !== null ? formatUsd(revenue.avgDealValueUsd) : "—"} />
        <StatTile
          label="ROI this month"
          value={revenue.roiMultiple !== null ? `${revenue.roiMultiple.toFixed(1)}×` : "—"}
          hint={
            revenue.monthlyPlanCostUsd !== null
              ? `revenue (30d) ÷ ${formatUsd(revenue.monthlyPlanCostUsd)}/mo plan cost`
              : "No active subscription"
          }
        />
        <StatTile
          label="Overall conversion"
          value={`${funnel.overallConversionPct.toFixed(1)}%`}
          hint={`${formatCount(funnel.total)} total leads`}
        />
      </div>

      <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Conversion funnel</h2>
        <ConversionFunnelChart funnel={funnel} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Revenue, last 30 days</h2>
          <MetricTrendChart
            points={revenue.trend.map((point) => ({ date: point.date, value: point.revenueUsd }))}
            emptyMessage="No deals closed in this window yet."
            formatValue={(value) => formatUsd(value)}
          />
        </div>
        <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Team activity, last 30 days</h2>
          <MetricTrendChart
            points={activity.map((point) => ({ date: point.date, value: point.total }))}
            emptyMessage="No activity logged in this window yet."
            formatValue={(value) => `${formatCount(value)} event${value === 1 ? "" : "s"}`}
          />
        </div>
      </div>

      <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Source performance</h2>
        <SourcePerformanceTable rows={sources} />
      </div>

      <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Agent performance</h2>
        <AgentPerformanceTable rows={agents} />
        <p className="text-muted-foreground text-xs">
          Company-wide median time to first touch:{" "}
          {stats.medianTimeToFirstTouchMinutes !== null ? formatMinutes(stats.medianTimeToFirstTouchMinutes) : "no data yet"}.
        </p>
      </div>
    </div>
  );
}
