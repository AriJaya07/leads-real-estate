import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/application/auth/current-user";
import { getPlatformBillingOverview } from "@/application/platform/billing.queries";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { PlatformShell } from "@/components/platform/platform-shell";
import { formatCount, formatUsd } from "@/shared/format";

export const metadata: Metadata = { title: "Platform Billing" };

async function BillingContent() {
  const user = await requirePlatformAdmin();
  const overview = await getPlatformBillingOverview();
  const totalActiveSubscriptions = overview.planDistribution.reduce((sum, p) => sum + p.activeSubscriptionCount, 0);

  return (
    <PlatformShell active="billing" userLabel={`${user.email.split("@")[0]} · Super Admin`}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Platform Billing"
          description="Plan mix and estimated recurring revenue, read from this app's own subscription records — not a Stripe reconciliation (real payment collection isn't wired up yet, see docs/saas-platform-architecture.md)."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Estimated MRR" value={formatUsd(overview.estimatedMrrUsd)} />
          <StatTile label="Active + trialing subscriptions" value={formatCount(totalActiveSubscriptions)} />
        </div>

        <DataTable minWidth="min-w-[520px]">
          <DataTableHead>
            <th>Plan</th>
            <th className="w-32">Price / mo</th>
            <th className="w-32">Subscriptions</th>
          </DataTableHead>
          <tbody>
            {overview.planDistribution.map((plan) => (
              <tr key={plan.planId} className="border-border border-t">
                <td className="px-3 py-3 font-medium">{plan.planName}</td>
                <td className="px-3 py-3 font-mono tabular-nums">
                  {plan.monthlyPriceUsd === null ? "custom" : formatUsd(plan.monthlyPriceUsd)}
                </td>
                <td className="px-3 py-3 font-mono tabular-nums">{formatCount(plan.activeSubscriptionCount)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </PlatformShell>
  );
}

export default function PlatformBillingPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-6"><StatRowSkeleton /></div>}>
      <BillingContent />
    </Suspense>
  );
}
