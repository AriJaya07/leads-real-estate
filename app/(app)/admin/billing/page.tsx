import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { requireOwner } from "@/application/auth/current-user";
import { getCompanyPlan, getSubscriptionStatus, getUsageSummary } from "@/application/billing/usage";
import { listPlans } from "@/application/billing/plan.actions";
import { PageHeader } from "@/components/common/page-header";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { UsageMeter } from "@/components/common/usage-meter";
import { Button } from "@/components/ui/button";
import { PlanPicker } from "@/features/billing/components/plan-picker";
import { formatCount, formatStorageKb } from "@/shared/format";

export const metadata: Metadata = { title: "Billing" };

/** Plain helper, not a component — keeps the impure `Date.now()` call out of `StatusBanner`'s render body. */
function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

/**
 * Stripe isn't wired yet (Tier-1 gap, `docs/final-recommendations.md`) — this
 * banner is designed against the real `subscriptions.status` column so it's
 * correct the moment webhooks start writing to it, but "Choose a plan" links
 * to the plan picker below rather than a Stripe checkout stub, matching the
 * "honest, not fake" posture the rest of the product takes with unenforced
 * feature flags.
 */
async function StatusBanner({ companyId }: { companyId: string }) {
  const sub = await getSubscriptionStatus(companyId);
  if (!sub) return null;

  if (sub.status === "trialing" && sub.currentPeriodEnd) {
    const daysLeft = daysUntil(sub.currentPeriodEnd);
    return (
      <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm">
        <span>
          Your trial ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}. Nothing will be deleted — collection pauses
          and the workspace goes read-only until you pick a plan.
        </span>
        <Button size="sm" render={<Link href="#plans" />}>
          Choose a plan
        </Button>
      </div>
    );
  }

  if (sub.status === "past_due") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--health-bad-fg)]/30 bg-[var(--health-bad-bg)] p-4 text-sm text-[var(--health-bad-fg)]">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">
          Payment failed. Collection continues for 7 days while we retry — update your payment method to avoid
          interruption.
        </span>
      </div>
    );
  }

  if (sub.status === "canceled") {
    return (
      <div className="border-border bg-muted/40 rounded-xl border p-4 text-sm">
        Subscription canceled — the workspace is read-only. Export is still available and your data is retained.
      </div>
    );
  }

  return null;
}

async function Usage({ companyId }: { companyId: string }) {
  const [plan, usage] = await Promise.all([getCompanyPlan(companyId), getUsageSummary(companyId)]);
  if (!plan || !usage) return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Current plan: <span className="font-semibold">{plan.planName}</span>
      </p>
      <div className="border-border grid gap-5 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-3">
        <UsageMeter label="Seats" used={usage.seats.used} limit={usage.seats.limit} />
        <UsageMeter label="Datasets" used={usage.datasets.used} limit={usage.datasets.limit} />
        <UsageMeter
          label="Records / month"
          used={usage.rawRecordsThisMonth.used}
          limit={usage.rawRecordsThisMonth.limit}
          formatValue={formatCount}
        />
        <UsageMeter
          label="Leads identified / month"
          used={usage.leadsThisMonth.used}
          limit={usage.leadsThisMonth.limit}
          formatValue={formatCount}
        />
        <UsageMeter
          label="Apify requests / month"
          used={usage.apifyRequestsThisMonth.used}
          limit={usage.apifyRequestsThisMonth.limit}
          formatValue={formatCount}
        />
        <UsageMeter
          label="Storage"
          used={usage.storageKb.used}
          limit={usage.storageKb.limit}
          formatValue={formatStorageKb}
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

      <Suspense fallback={null}>
        <StatusBanner companyId={user.companyId} />
      </Suspense>

      <Suspense fallback={<StatRowSkeleton />}>
        <Usage companyId={user.companyId} />
      </Suspense>

      <div id="plans">
        <h2 className="mb-3 text-sm font-medium">Available plans</h2>
        <Suspense fallback={<TableSkeleton rows={4} />}>
          {plan && <Plans currentPlanId={plan.planId} />}
        </Suspense>
      </div>
    </div>
  );
}
