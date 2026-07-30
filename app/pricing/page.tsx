import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { listPlans } from "@/application/billing/plan.actions";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { formatCount, formatStorageKb, formatUsd } from "@/shared/format";
import type { PlanFeatures } from "@/domain/billing/plan-features";
import { cn } from "@/lib/utils";

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

async function PricingGrid() {
  const plans = await listPlans();

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan, index) => {
        // The third tier (Business) is the deliberate anchor — see
        // docs/pricing-strategy.md's decoy-effect rationale.
        const highlighted = index === 2;
        const isCustom = plan.monthlyPriceUsd !== null && plan.annualPriceUsd === null && index === plans.length - 1;

        return (
          <div
            key={plan.id}
            className={cn(
              "border-border flex flex-col gap-5 rounded-2xl border p-6",
              highlighted && "border-foreground shadow-lg",
            )}
          >
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{plan.name}</h2>
              <div className="mt-2 flex items-baseline gap-1">
                {plan.monthlyPriceUsd === null ? (
                  <span className="text-2xl font-semibold">Contact us</span>
                ) : (
                  <>
                    <span className="text-3xl font-semibold tabular-nums">{formatUsd(plan.monthlyPriceUsd)}</span>
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

            <Button
              render={<Link href="/signup" />}
              variant={highlighted ? "default" : "outline"}
              className="w-full"
            >
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
      })}
    </div>
  );
}

export default function PricingPage() {
  return (
    <main id="main-content" className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="size-8" />
          <span className="text-sm font-semibold tracking-tight">DreamRue</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Button render={<Link href="/signup" />} size="sm">
            Get started
          </Button>
        </nav>
      </header>

      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Simple, usage-based pricing</h1>
        <p className="text-muted-foreground mt-3 text-balance">
          Every plan includes the full lead pipeline — sourcing through alerting. Pick the tier that matches how
          much data you move; every plan starts with a 14-day free trial, no card required.
        </p>
      </div>

      <Suspense fallback={<p className="text-muted-foreground text-center">Loading plans…</p>}>
        <PricingGrid />
      </Suspense>
    </main>
  );
}
