"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setLocalStorageValue, useLocalStorageValue } from "@/hooks/use-local-storage-value";
import { SourceOnboardingWizard } from "./source-onboarding-wizard";

const DISMISSED_KEY = "averonai:onboarding-checklist:dismissed";

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
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {doneCount}/{steps.length}
        </span>
        <Button size="icon-sm" variant="ghost" aria-label="Dismiss setup checklist" onClick={dismiss}>
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {steps.map((step) => (
          <div key={step.label} className="flex min-w-0 items-center gap-2 text-sm">
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full",
                step.done ? "bg-[var(--health-ok-bg)] text-[var(--health-ok-fg)]" : "bg-muted text-muted-foreground",
              )}
            >
              {step.done && <Check className="size-3" aria-hidden />}
            </span>
            {step.done ? (
              <span className="text-muted-foreground truncate line-through">{step.label}</span>
            ) : step.label === "Source connected" ? (
              <SourceOnboardingWizard />
            ) : (
              <Button size="sm" variant="outline" className="min-w-0" render={<Link href={step.href} />}>
                <span className="truncate">{step.cta}</span>
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
