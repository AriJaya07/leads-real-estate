"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setLocalStorageValue, useLocalStorageValue } from "@/hooks/use-local-storage-value";
import { SourceOnboardingWizard } from "./source-onboarding-wizard";

const DISMISSED_KEY = "dreamrue:onboarding-checklist:dismissed";

interface Step {
  label: string;
  done: boolean;
  href: string;
  cta: string;
}

/**
 * Dismissible first-login card pulling *live* completion state (source
 * connected? teammate invited?) rather than a static graphic. "Source
 * connected" opens the preview wizard in place — see
 * `source-onboarding-wizard.tsx` for why it's a dataset picker, not a page
 * navigation — and the wizard's own empty state still deep-links to
 * `/admin/collection` for actually configuring a brand-new source. "Invite
 * your team" stays a direct link; no preview step makes sense for it.
 */
export function OnboardingChecklist({
  hasSource,
  hasTeammates,
}: {
  hasSource: boolean;
  hasTeammates: boolean;
}) {
  const dismissed = useLocalStorageValue(DISMISSED_KEY) === "true";

  const steps: Step[] = [
    { label: "Source connected", done: hasSource, href: "/admin/collection", cta: "Connect a source" },
    { label: "Invite your team", done: hasTeammates, href: "/admin/team", cta: "Invite your team" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  if (dismissed || doneCount === steps.length) return null;

  function dismiss() {
    setLocalStorageValue(DISMISSED_KEY, "true");
  }

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {doneCount}/{steps.length}
        </span>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full",
                  step.done ? "bg-[var(--health-ok-bg)] text-[var(--health-ok-fg)]" : "bg-muted text-muted-foreground",
                )}
              >
                {step.done && <Check className="size-3" aria-hidden />}
              </span>
              {step.done ? (
                <span className="text-muted-foreground line-through">{step.label}</span>
              ) : step.label === "Source connected" ? (
                <SourceOnboardingWizard />
              ) : (
                <Button size="sm" variant="outline" render={<Link href={step.href} />}>
                  {step.cta}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label="Dismiss setup checklist" onClick={dismiss}>
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}
