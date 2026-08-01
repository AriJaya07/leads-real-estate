import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import { listPlans } from "@/application/billing/plan.actions";
import { Button } from "@/components/ui/button";
import { formatCount, formatStorageKb, formatUsd } from "@/shared/format";
import type { PlanFeatures } from "@/domain/billing/plan-features";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/marketing/eyebrow";

type Plan = Awaited<ReturnType<typeof listPlans>>[number];

export const metadata: Metadata = { title: "Pricing" };

const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  whatsappAlerts: "WhatsApp alerts",
  llmShadowClassify: "AI-assisted lead classification",
  aiAssistant: "AI lead summaries & message drafting",
  customBranding: "Custom branding",
  prioritySupport: "Priority support",
  sso: "Single sign-on (SSO)",
};

function limitText(value: number | null, unit: string): string {
  return value === null ? `Unlimited ${unit}` : `${formatCount(value)} ${unit}`;
}

function PlanCard({ plan, index, plansCount, highlighted }: { plan: Plan; index: number; plansCount: number; highlighted: boolean }) {
  const isCustom = plan.monthlyPriceUsd !== null && plan.annualPriceUsd === null && index === plansCount - 1;

  return (
    <div
      className={cn(
        "border-border bg-card relative flex flex-col gap-5 rounded-2xl border p-6",
        highlighted && "border-brand shadow-[0_20px_60px_-20px_var(--brand)] lg:-translate-y-4",
      )}
    >
      {highlighted && (
        <span className="bg-accent-warm text-background absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold">
          <Sparkles className="size-3" aria-hidden />
          Recommended
        </span>
      )}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{plan.name}</h2>
        <div className="mt-2 flex items-baseline gap-1">
          {plan.monthlyPriceUsd === null ? (
            <span className="font-serif text-2xl font-semibold italic">Contact us</span>
          ) : (
            <>
              <span className="font-serif text-3xl font-semibold tabular-nums">{formatUsd(plan.monthlyPriceUsd)}</span>
              <span className="text-muted-foreground text-sm">/mo{isCustom ? " starting" : ""}</span>
            </>
          )}
        </div>
        {plan.annualPriceUsd !== null && (
          <p className="text-muted-foreground mt-1 text-xs">
            or {formatUsd(plan.annualPriceUsd)}/yr — save{" "}
            {Math.round(100 - (plan.annualPriceUsd / (plan.monthlyPriceUsd! * 12)) * 100)}%
          </p>
        )}
      </div>

      <Button render={<Link href="/signup" />} variant={highlighted ? "default" : "outline"} className="w-full">
        {plan.monthlyPriceUsd === null ? "Contact sales" : "Start free trial"}
      </Button>

      <ul className="flex flex-col gap-2 text-sm">
        <li>{limitText(plan.maxSeats, "team members")}</li>
        <li>{limitText(plan.maxDatasets, "connected datasets")}</li>
        <li>{formatCount(plan.maxRawRecordsPerMonth)} records fetched / month</li>
        <li>{formatCount(plan.maxLeadsPerMonth)} leads identified / month</li>
        <li>{formatCount(plan.maxApifyRequestsPerMonth)} Apify requests / month</li>
        <li>{formatStorageKb(plan.maxStorageKb)} storage</li>
        <li>{limitText(plan.maxAlertRules, "alert rules")}</li>
        <li>{plan.dataRetentionDays}-day data retention</li>
      </ul>

      <ul className="border-border flex flex-col gap-2 border-t pt-4 text-sm">
        {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[]).map((key) => {
          const included = Boolean(plan.features?.[key]);
          return (
            <li key={key} className={cn("flex items-center gap-2", !included && "text-muted-foreground")}>
              {included ? (
                <Check className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <X className="size-3.5 shrink-0 opacity-50" aria-hidden />
              )}
              {FEATURE_LABELS[key]}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

async function PricingGrid() {
  const plans = await listPlans();
  // The third tier (Business) is the deliberate anchor — see
  // docs/pricing-strategy.md's decoy-effect rationale. The last tier (custom/
  // Enterprise) breaks out of the grid entirely so it never reads as an
  // orphaned, half-empty 4th cell.
  const mainPlans = plans.length > 3 ? plans.slice(0, 3) : plans;
  const customPlan = plans.length > 3 ? plans[plans.length - 1] : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 pt-3 md:grid-cols-3">
        {mainPlans.map((plan, index) => (
          <PlanCard key={plan.id} plan={plan} index={index} plansCount={plans.length} highlighted={index === 2} />
        ))}
      </div>

      {customPlan && (
        <div className="border-border bg-surface-alt flex flex-col items-center justify-between gap-4 rounded-2xl border p-6 sm:flex-row sm:pl-8">
          <div className="text-center sm:text-left">
            <h2 className="text-lg font-semibold tracking-tight">{customPlan.name}</h2>
            <p className="text-muted-foreground mt-1 max-w-md text-sm">
              {limitText(customPlan.maxSeats, "team members")} · {formatCount(customPlan.maxLeadsPerMonth)} leads/mo
              · custom SLA and onboarding.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="font-serif text-xl font-semibold italic">
              {customPlan.monthlyPriceUsd === null ? "Contact us" : `From ${formatUsd(customPlan.monthlyPriceUsd)}/mo`}
            </span>
            <Button render={<Link href="/signup" />} variant="outline">
              Contact sales
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
      <div className="text-center">
        <Eyebrow>Pricing</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Simple, usage-based pricing</h1>
        <p className="text-muted-foreground mt-3 text-balance">
          Every plan includes the full lead pipeline — sourcing through alerting. Pick the tier that matches how
          much data you move; every plan starts with a 14-day free trial, no card required.
        </p>
      </div>

      <Suspense fallback={<p className="text-muted-foreground text-center">Loading plans…</p>}>
        <PricingGrid />
      </Suspense>
    </div>
  );
}
