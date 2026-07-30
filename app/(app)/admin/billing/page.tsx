import { Suspense } from "react";
import type { Metadata } from "next";
import { requireOwner } from "@/application/auth/current-user";
import { getCompanyPlan, getUsageSummary } from "@/application/billing/usage";
import { listPlans } from "@/application/billing/plan.actions";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { PlanPicker } from "@/features/billing/components/plan-picker";
import { formatCount, formatStorageKb } from "@/shared/format";

export const metadata: Metadata = { title: "Billing" };

async function Usage({ companyId }: { companyId: string }) {
  const [plan, usage] = await Promise.all([getCompanyPlan(companyId), getUsageSummary(companyId)]);
  if (!plan || !usage) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Current plan: <span className="font-semibold">{plan.planName}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Seats"
          value={`${usage.seats.used} / ${usage.seats.limit ?? "∞"}`}
        />
        <StatTile
          label="Datasets"
          value={`${usage.datasets.used} / ${usage.datasets.limit}`}
        />
        <StatTile
          label="Data fetched / mo"
          value={`${formatCount(usage.rawRecordsThisMonth.used)} / ${formatCount(usage.rawRecordsThisMonth.limit)}`}
        />
        <StatTile
          label="Leads identified / mo"
          value={`${formatCount(usage.leadsThisMonth.used)} / ${formatCount(usage.leadsThisMonth.limit)}`}
        />
        <StatTile
          label="Apify requests / mo"
          value={`${formatCount(usage.apifyRequestsThisMonth.used)} / ${formatCount(usage.apifyRequestsThisMonth.limit)}`}
        />
        <StatTile
          label="Storage"
          value={`${formatStorageKb(usage.storageKb.used)} / ${formatStorageKb(usage.storageKb.limit)}`}
        />
      </div>
    </div>
  );
}

async function Plans({ currentPlanId }: { currentPlanId: string }) {
  const plans = await listPlans();
  return <PlanPicker plans={plans} currentPlanId={currentPlanId} />;
}

export default async function AdminBillingPage() {
  const user = await requireOwner();
  const plan = await getCompanyPlan(user.companyId);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Billing"
        description="Your plan controls how much data you can pull through the pipeline each month. Switching plans takes effect immediately — no proration yet, see docs/pricing-strategy.md."
      />

      <Suspense fallback={<StatRowSkeleton />}>
        <Usage companyId={user.companyId} />
      </Suspense>

      <div>
        <h2 className="mb-3 text-sm font-medium">Available plans</h2>
        <Suspense fallback={<TableSkeleton rows={4} />}>
          {plan && <Plans currentPlanId={plan.planId} />}
        </Suspense>
      </div>
    </div>
  );
}
