"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/spinner";
import { formatCount, formatStorageKb, formatUsd } from "@/shared/format";
import { changePlan } from "@/application/billing/plan.actions";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";
import type { PlanRow } from "@/infrastructure/db/schema/company";

function limitText(value: number | null, unit: string): string {
  return value === null ? `Unlimited ${unit}` : `${formatCount(value)} ${unit}`;
}

export function PlanPicker({ plans, currentPlanId }: { plans: PlanRow[]; currentPlanId: string }) {
  const { busyId, run } = useServerAction();
  const busy = busyId !== null;

  async function switchTo(plan: PlanRow) {
    await run("switch", () => changePlan({ planId: plan.id }), {
      errorFallback: "Could not change plan",
      onSuccess: (result) => toast.success(`Switched to the ${result.planName} plan`),
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlanId;
        return (
          <div
            key={plan.id}
            className={cn(
              "border-border bg-card relative flex flex-col gap-4 rounded-xl border p-4",
              isCurrent && "border-brand ring-brand/15 ring-1",
            )}
          >
            {isCurrent && (
              <span className="bg-brand absolute -top-2.5 left-4 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium text-white">
                Current plan
              </span>
            )}
            <div>
              <h3 className="font-semibold">{plan.name}</h3>
              <p className="text-muted-foreground text-sm">
                {plan.monthlyPriceUsd === null ? "Contact sales" : `${formatUsd(plan.monthlyPriceUsd)}/mo`}
              </p>
            </div>

            <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
              <li>{limitText(plan.maxSeats, "seats")}</li>
              <li>{limitText(plan.maxDatasets, "datasets")}</li>
              <li>{formatCount(plan.maxApifyRequestsPerMonth)} Apify req/mo</li>
              <li>{formatStorageKb(plan.maxStorageKb)} storage</li>
            </ul>

            <Button
              size="sm"
              variant={isCurrent ? "outline" : "default"}
              disabled={isCurrent || busy}
              onClick={() => void switchTo(plan)}
              aria-label={isCurrent ? `Current plan: ${plan.name}` : `Switch to ${plan.name}`}
              className="mt-auto"
            >
              {busy && busyId === "switch" ? <Spinner className="size-3.5" /> : null}
              {isCurrent ? "Your plan" : "Switch to this plan"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
