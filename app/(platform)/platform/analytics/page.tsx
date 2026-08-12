import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import { getPlatformAnalytics } from "@/application/platform/analytics.queries";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { Badge } from "@/components/ui/badge";
import { PlatformShell } from "@/components/platform/platform-shell";
import { formatCount } from "@/shared/format";

export const metadata: Metadata = { title: "Platform Analytics" };

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
};

async function AnalyticsContent() {
  const user = await requirePlatformAdmin();
  const analytics = await getPlatformAnalytics();
  const leadsDelta = analytics.leadsThisMonthAcrossPlatform - analytics.leadsLastMonthAcrossPlatform;

  return (
    <PlatformShell active="analytics" userLabel={`${user.email.split("@")[0]} · Super Admin`}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Platform Analytics"
          description="Totals across every tenant — never a per-tenant lead row, only the sums each tenant's own usage counters already produce."
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Leads this month, platform-wide"
            value={formatCount(analytics.leadsThisMonthAcrossPlatform)}
            hint={
              leadsDelta === 0
                ? "flat vs last month"
                : `${leadsDelta > 0 ? "+" : ""}${formatCount(leadsDelta)} vs last month`
            }
          />
          <StatTile
            label="Apify requests this month"
            value={formatCount(analytics.apifyRequestsThisMonthAcrossPlatform)}
          />
          <StatTile
            label="Leads last month, platform-wide"
            value={formatCount(analytics.leadsLastMonthAcrossPlatform)}
          />
        </div>

        <div className="border-border rounded-xl border">
          <div className="border-border border-b px-4 py-3 text-sm font-semibold">Tenants by status</div>
          <div className="flex flex-wrap gap-3 p-4">
            {analytics.tenantsByStatus.map((row) => (
              <div key={row.status} className="border-border flex items-center gap-2 rounded-lg border px-3 py-2">
                <Badge variant="secondary">{STATUS_LABEL[row.status] ?? row.status}</Badge>
                <span className="font-mono text-sm tabular-nums">{formatCount(row.count)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PlatformShell>
  );
}

export default function PlatformAnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-6"><StatRowSkeleton /></div>}>
      <AnalyticsContent />
    </Suspense>
  );
}
