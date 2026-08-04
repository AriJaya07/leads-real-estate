import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { TriangleAlert } from "lucide-react";
import { requireOwner } from "@/application/auth/current-user";
import {
  getCompanyPlan,
  getSubscriptionStatus,
  getUsageSummary,
  type SubscriptionStatus,
} from "@/application/billing/usage";
import { listPlans } from "@/application/billing/plan.actions";
import { PageHeader } from "@/components/common/page-header";
import { StatRowSkeleton } from "@/components/common/stat-row-skeleton";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { UsageMeter } from "@/components/common/usage-meter";
import { Button } from "@/components/ui/button";
import { PlanPicker } from "@/features/billing/components/plan-picker";
import { cn } from "@/lib/utils";
import { formatCount, formatStorageKb, formatUsd } from "@/shared/format";

export const metadata: Metadata = { title: "Billing" };

/** Plain helper, not a component — keeps the impure `Date.now()` call out of `StatusBanner`'s render body. */
function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

/**
 * Same three-tier palette `HealthPill`/`UsageMeter` use — trialing reads as
 * "watch" (amber), past_due as "bad" (red), active as "ok" (green). No new
 * colour scheme invented for subscription status.
 */
const STATUS_TONE: Record<SubscriptionStatus["status"], string> = {
  trialing: "bg-[var(--health-warn-bg)] text-[var(--health-warn-fg)]",
  active: "bg-[var(--health-ok-bg)] text-[var(--health-ok-fg)]",
  past_due: "bg-[var(--health-bad-bg)] text-[var(--health-bad-fg)]",
  canceled: "bg-muted text-muted-foreground",
  paused: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<SubscriptionStatus["status"], string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  paused: "Paused",
};

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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--health-warn-fg)]/25 bg-[var(--health-warn-bg)] p-4 text-sm text-[var(--health-warn-fg)]">
        <span className="flex-1">
          <strong className="font-medium">
            Your trial ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}.
          </strong>{" "}
          Nothing will be deleted — collection pauses and the workspace goes read-only until you pick a plan.
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

/**
 * Left: the plan the company is actually on, read from `subscriptions` +
 * `plans` (no fabricated seat counts or renewal dates). Right: the same
 * `UsageMeter` grid as before, now including `alertRules` — `getUsageSummary`
 * already returns it, it just wasn't rendered here yet. "Manage billing"
 * stays a disabled stub with an explicit note rather than looking live,
 * since Stripe checkout isn't wired (see `StatusBanner`'s comment above).
 */
async function BillingOverview({ companyId }: { companyId: string }) {
  const [companyPlan, usage, subscription, plans] = await Promise.all([
    getCompanyPlan(companyId),
    getUsageSummary(companyId),
    getSubscriptionStatus(companyId),
    listPlans(),
  ]);
  if (!companyPlan || !usage) return null;

  // `listPlans()` is ordered cheapest-first, so the next entry after the
  // current one is always the next upgrade tier, never a lateral/downgrade.
  const currentIndex = plans.findIndex((p) => p.id === companyPlan.planId);
  const currentPlanRow = currentIndex >= 0 ? plans[currentIndex] : null;
  const nextPlan = currentIndex >= 0 && currentIndex < plans.length - 1 ? plans[currentIndex + 1] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr] lg:items-start">
      <div className="border-border flex flex-col rounded-xl border p-5">
        <p className="text-muted-foreground text-xs">Current plan</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xl font-semibold tracking-tight">{companyPlan.planName}</span>
          {subscription && (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                STATUS_TONE[subscription.status],
              )}
            >
              {STATUS_LABEL[subscription.status]}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {currentPlanRow?.monthlyPriceUsd == null ? "Contact sales" : `${formatUsd(currentPlanRow.monthlyPriceUsd)}/mo`}
          {subscription?.currentPeriodEnd ? ` · renews ${format(subscription.currentPeriodEnd, "d MMM yyyy")}` : null}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <Button size="sm" render={<Link href="#plans" />}>
            {nextPlan ? `Upgrade to ${nextPlan.name}` : "Compare plans"}
          </Button>
          <Button size="sm" variant="outline" disabled title="Stripe checkout isn't wired up yet">
            Manage billing
          </Button>
        </div>
        <p className="text-muted-foreground mt-2.5 text-xs leading-relaxed">
          Opens the hosted checkout. Stripe isn&apos;t wired yet — the button is a stub, and we say so rather than
          faking it.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Usage this period</p>
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
          <UsageMeter label="Alert rules" used={usage.alertRules.used} limit={usage.alertRules.limit} />
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

      <Suspense fallback={<StatRowSkeleton count={7} />}>
        <BillingOverview companyId={user.companyId} />
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
