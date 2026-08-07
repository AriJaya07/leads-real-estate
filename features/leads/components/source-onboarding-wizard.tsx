"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/spinner";
import { IntentBadge } from "@/components/common/intent-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { runDiscovery, runSync } from "@/application/datasets/dataset.actions";
import { listOnboardingCandidatesAction, previewSourceAction } from "@/application/sync/onboarding.actions";
import type { OnboardingCandidate } from "@/application/datasets/dataset-queries";
import type { SourcePreviewItem } from "@/application/sync/preview-source";

type Step = "pick" | "preview" | "done";

/**
 * Replaces the onboarding checklist's "Source connected" step with a
 * preview before commitment, per the design doc — show the product working
 * on a real sample before asking for the ongoing sync. Nothing is saved
 * until step 3's "Looks good — start collecting" (the same `runSync` action
 * `/admin/datasets`'s own sync button already calls); steps 1-2 are entirely
 * read-only (`listOnboardingCandidatesAction`/`previewSourceAction`, see
 * `application/sync/preview-source.ts` for why that's safe to call freely).
 *
 * Deliberately a dataset picker, not a "paste a Facebook group URL" field —
 * this app only ever *reads* datasets n8n/Apify already produced (see
 * docs/architecture.md's "polling, not scraping-on-demand" design); a URL
 * input here would imply a live-scrape capability that doesn't exist.
 *
 * Owns its own trigger button and `open` state — same shape as `MobileNav`/
 * `MarketingMobileNav` — rather than being externally controlled, so opening
 * it (a real user action) is what loads step 1's candidates, not a passive
 * effect reacting to a prop.
 */
export function SourceOnboardingWizard() {
  const [open, setOpen] = useState(false);
  const { busyId, run } = useServerAction();
  const [step, setStep] = useState<Step>("pick");
  const [candidates, setCandidates] = useState<OnboardingCandidate[] | null>(null);
  const [selected, setSelected] = useState<OnboardingCandidate | null>(null);
  const [preview, setPreview] = useState<{ items: SourcePreviewItem[]; label: string | null; isGuessedMapping: boolean } | null>(
    null,
  );

  async function loadCandidates() {
    const result = await listOnboardingCandidatesAction();
    setCandidates(result?.data ?? []);
  }

  function openWizard() {
    setOpen(true);
    setStep("pick");
    setSelected(null);
    setPreview(null);
    setCandidates(null);
    void loadCandidates();
  }

  async function discoverMore() {
    await run("discover", () => runDiscovery(), {
      errorFallback: "Couldn't check for new sources.",
      onSuccess: () => void loadCandidates(),
    });
  }

  async function choose(candidate: OnboardingCandidate) {
    setSelected(candidate);
    await run("preview", () => previewSourceAction({ datasetId: candidate.id }), {
      errorFallback: "Couldn't pull a sample from that source.",
      onSuccess: (data) => {
        setPreview(data);
        setStep("preview");
      },
    });
  }

  async function confirm() {
    if (!selected) return;
    await run("confirm", () => runSync({ datasetId: selected.id, force: true }), {
      errorFallback: "Couldn't start the sync.",
      invalidateKeys: [["datasets"]],
      onSuccess: () => setStep("done"),
    });
  }

  const stepIndex = step === "pick" ? 0 : step === "preview" ? 1 : 2;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={openWizard}>
        Connect a source
      </Button>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetTitle className="sr-only">Connect a source</SheetTitle>

        <div className="border-border flex items-center gap-1.5 border-b p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-[var(--brand)]" : "bg-muted"}`} />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === "pick" && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">Step 1 of 3</p>
                <h2 className="mt-1 text-lg font-semibold">Pick a source to preview</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  A one-time sample pull — nothing is saved until you confirm at the end.
                </p>
              </div>

              {candidates === null ? (
                <div className="flex justify-center py-8">
                  <Spinner className="size-5" />
                </div>
              ) : candidates.length === 0 ? (
                <div className="border-border rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm">No newly discovered sources yet.</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Add one from{" "}
                    <Link href="/admin/collection" className="underline">
                      Collect data
                    </Link>{" "}
                    first, then check again here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      disabled={busyId === "preview"}
                      onClick={() => void choose(candidate)}
                      className="border-border hover:border-[var(--brand)] hover:bg-accent/40 flex items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{candidate.label}</span>
                        <span className="text-muted-foreground block truncate text-xs">{candidate.sourceName}</span>
                      </span>
                      {busyId === "preview" && selected?.id === candidate.id ? (
                        <Spinner className="size-4 shrink-0" />
                      ) : (
                        <span className="text-muted-foreground shrink-0 text-xs">{candidate.itemCount} items</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <Button variant="outline" size="sm" onClick={() => void discoverMore()} disabled={busyId === "discover"} className="self-start">
                {busyId === "discover" ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />}
                Check for new sources
              </Button>
            </div>
          )}

          {step === "preview" && preview && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">Step 2 of 3 · Preview</p>
                <h2 className="mt-1 text-lg font-semibold">Here&apos;s what we found</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  A sample from <strong className="text-foreground font-medium">{preview.label ?? "this source"}</strong> — nothing
                  saved yet.
                </p>
              </div>

              {preview.items.length === 0 ? (
                <p className="text-muted-foreground text-sm">This source has no items to preview yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {preview.items.map((item, index) => (
                    <div key={index} className="border-border rounded-lg border p-3">
                      <IntentBadge intent={item.intent} />
                      <p className="font-serif mt-2 line-clamp-3 text-sm italic">
                        {item.listingTitle ? `${item.listingTitle} — ` : ""}
                        {item.body || "(no text)"}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {preview.isGuessedMapping && (
                <p className="text-muted-foreground text-xs">
                  No curated mapping matched this source&apos;s shape yet, so this classification is a best guess — an admin can
                  review and refine it under Collect data once syncing starts.
                </p>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("pick")}>
                  Back
                </Button>
                <Button size="sm" onClick={() => void confirm()} disabled={busyId === "confirm"}>
                  {busyId === "confirm" && <Spinner className="size-3.5" />}
                  Looks good — start collecting
                </Button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="bg-[var(--brand)] flex size-10 items-center justify-center rounded-full text-white">✓</div>
              <h2 className="text-lg font-semibold">This source is collecting now</h2>
              <p className="text-muted-foreground max-w-xs text-sm">
                New leads from {preview?.label ?? "this source"} will start showing up in your inbox on its normal sync
                schedule.
              </p>
              <Button size="sm" render={<Link href="/leads">Go to inbox</Link>} className="mt-2" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
