"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/common/spinner";
import { EmptyState } from "@/components/common/empty-state";
import { UsageMeter } from "@/components/common/usage-meter";
import { FieldRenderer } from "@/components/common/field-renderer";
import { requestScrape } from "@/application/collection/scrape-requests.actions";
import { useServerAction } from "@/hooks/use-server-action";
import { buildActorInput } from "@/domain/collection/actor-request";
import { cn } from "@/lib/utils";
import { formatCount } from "@/shared/format";
import type { ActorTemplateRow } from "@/infrastructure/db/schema/collection";

const STEPS = [
  { key: "source", label: "Data source" },
  { key: "filters", label: "Configure filters" },
  { key: "review", label: "Review & trigger" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

/**
 * The product's core workflow, owner-facing: select a data source, configure
 * its filters, review the exact requirement before it spends real Apify
 * budget, then trigger. The system already knows which actor to call and how
 * (`buildActorInput` in `domain/collection/actor-request.ts`) — this is only
 * steps 1-3 of "select source → configure filters → review → trigger"; step 4
 * onward (system picks the actor, runs it, stores results) is
 * `startScrapeRequest` + the Apify webhook, unchanged by this form.
 *
 * A template with a registered `paramSchema` gets one generic field per entry
 * (`FieldRenderer` — the same component every other schema-driven surface in
 * this app will reuse, per the field-renderer rule in
 * "AveronAI - Apify + N8N Architecture.md" §3.2). A template without one
 * (registered before `paramSchema` existed, or an intentionally free-form
 * actor) falls back to the original raw-JSON textarea — never a dead end.
 *
 * The platform picker is a card grid rather than a plain `<select>`
 * specifically because it's driven off `templates` — any platform with at
 * least one registered actor template shows up as its own card with no code
 * change (Google Maps/LinkedIn/etc. are data, not a deploy).
 */
export function RequestScrapeForm({
  templates,
  companyCategoryId,
  quota = null,
}: {
  templates: ActorTemplateRow[];
  /** Drives the "Recommended" badge below — templates already arrive pre-sorted by category match (see app/(app)/admin/collection/page.tsx). */
  companyCategoryId: string;
  /** This company's current Apify-request budget for the month, `null` when there's no subscription row (see `getUsageSummary`). */
  quota?: { used: number; limit: number } | null;
}) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const busy = busyId === "request-scrape";

  const [step, setStep] = useState<StepKey>("source");

  const platforms = useMemo(() => Array.from(new Set(templates.map((t) => t.platform))).sort(), [templates]);
  const [platform, setPlatform] = useState(platforms[0] ?? "");
  const templatesForPlatform = useMemo(
    () => templates.filter((t) => t.platform === platform),
    [templates, platform],
  );
  const [templateId, setTemplateId] = useState(templatesForPlatform[0]?.id ?? "");
  const template = templatesForPlatform.find((t) => t.id === templateId) ?? templatesForPlatform[0];
  const hasSchema = (template?.paramSchema.length ?? 0) > 0;

  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [paramsText, setParamsText] = useState(() => seedParams(template));
  const [error, setError] = useState<string | null>(null);

  function selectPlatform(next: string) {
    setPlatform(next);
    const first = templates.find((t) => t.platform === next);
    setTemplateId(first?.id ?? "");
    setFieldValues({});
    setParamsText(seedParams(first));
    setError(null);
  }

  function selectTemplate(next: ActorTemplateRow | undefined) {
    setTemplateId(next?.id ?? "");
    setFieldValues({});
    setParamsText(seedParams(next));
    setError(null);
  }

  if (templates.length === 0) {
    return (
      <EmptyState
        title="No actor templates registered yet"
        description="Ask an admin to register an Apify actor below before you can request a scrape."
      />
    );
  }
  if (!template) return null;

  /** Resolves this step's raw filter input into the exact body `buildActorInput` would send — used for both validation and the review step's preview. */
  function resolveParams(): { ok: true; params: Record<string, unknown> } | { ok: false; message: string } {
    if (hasSchema) return { ok: true, params: fieldValues };
    try {
      return { ok: true, params: paramsText.trim() ? JSON.parse(paramsText) : {} };
    } catch {
      return { ok: false, message: "Requirements must be valid JSON." };
    }
  }

  function goToReview() {
    const resolved = resolveParams();
    if (!resolved.ok) {
      setError(resolved.message);
      return;
    }
    const built = buildActorInput(template, resolved.params);
    if (!built.ok) {
      setError(`Missing required filter${built.missing.length === 1 ? "" : "s"}: ${built.missing.join(", ")}`);
      return;
    }
    setError(null);
    setStep("review");
  }

  async function confirmAndTrigger() {
    const resolved = resolveParams();
    if (!resolved.ok) {
      setError(resolved.message);
      setStep("filters");
      return;
    }
    await run("request-scrape", () => requestScrape({ actorTemplateId: template.id, params: resolved.params }), {
      errorFallback: "Could not start the scrape",
      onSuccess: (data) => {
        toast.success(
          data.reused
            ? `Reusing an in-flight/recent request for ${template.name} — no new Apify run started`
            : `Started collecting ${template.name}`,
        );
        setStep("source");
        setFieldValues({});
        router.refresh();
      },
    });
  }

  const resolvedForReview = resolveParams();
  const builtForReview = resolvedForReview.ok ? buildActorInput(template, resolvedForReview.params) : null;

  return (
    <div className="flex flex-col gap-5">
      <Stepper current={step} />

      {step === "source" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Data source</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {platforms.map((p) => {
                const count = templates.filter((t) => t.platform === p).length;
                const active = p === platform;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => selectPlatform(p)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active ? "border-brand bg-brand/5" : "border-border hover:bg-accent/40",
                    )}
                  >
                    <span className="text-sm font-medium capitalize">{platformLabel(p)}</span>
                    <span className="text-muted-foreground text-xs">
                      {count} requirement{count === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="scrape-requirement">Requirement</Label>
            <Select
              id="scrape-requirement"
              value={template.id}
              onChange={(event) => selectTemplate(templatesForPlatform.find((t) => t.id === event.target.value))}
            >
              {templatesForPlatform.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.categoryId === companyCategoryId ? "★ " : ""}
                  {t.requirementKind} — {t.name}
                </option>
              ))}
            </Select>
          </div>

          {template.categoryId === companyCategoryId && (
            <p className="text-brand text-xs font-medium">★ Recommended for your category</p>
          )}
          {template.description && <p className="text-muted-foreground text-sm">{template.description}</p>}
          {template.costNote && (
            <p className="text-muted-foreground text-xs">
              <span className="font-medium">Cost:</span> {template.costNote}
            </p>
          )}

          <Button type="button" onClick={() => setStep("filters")} className="self-start">
            Continue to filters
          </Button>
        </div>
      )}

      {step === "filters" && (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            {platformLabel(template.platform)} · {template.requirementKind}
          </p>

          {hasSchema ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {template.paramSchema.map((field) => (
                <div key={field.key} className={field.type === "textarea" || field.type === "multiselect" ? "sm:col-span-2" : undefined}>
                  <FieldRenderer
                    field={field}
                    value={fieldValues[field.key]}
                    onChange={(value) => setFieldValues((prev) => ({ ...prev, [field.key]: value }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scrape-params">
                Requirements {template.requiredParams.length > 0 ? `(required: ${template.requiredParams.join(", ")})` : "(JSON)"}
              </Label>
              <Textarea
                id="scrape-params"
                value={paramsText}
                onChange={(event) => setParamsText(event.target.value)}
                rows={6}
                className="font-mono text-xs"
                spellCheck={false}
              />
              <p className="text-muted-foreground text-xs">
                No structured filters are registered for this actor yet — an admin can add them from the actor
                templates section below. Until then, requirements are edited as raw JSON.
              </p>
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("source")}>
              Back
            </Button>
            <Button type="button" onClick={goToReview}>
              Continue to review
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-4">
          <div className="border-border flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{template.name}</div>
                <div className="text-muted-foreground text-xs capitalize">
                  {platformLabel(template.platform)} · {template.requirementKind}
                </div>
              </div>
              {template.costNote && <div className="text-muted-foreground text-xs">{template.costNote}</div>}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Data requirements
              </div>
              {builtForReview && Object.keys(builtForReview.input).length > 0 ? (
                <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {Object.entries(builtForReview.input).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <dt className="text-xs font-medium">{fieldLabel(template.paramSchema, key)}</dt>
                      <dd className="text-muted-foreground truncate font-mono text-xs" title={String(value)}>
                        {Array.isArray(value) ? value.join(", ") || "—" : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-muted-foreground text-xs">No parameters — this actor runs with its defaults.</p>
              )}
            </div>
          </div>

          <div className="border-border bg-muted/30 flex flex-wrap items-center gap-4 rounded-xl border p-3">
            {quota && (
              <UsageMeter
                label="Apify requests this month"
                used={quota.used}
                limit={quota.limit}
                formatValue={formatCount}
                className="min-w-48 flex-1"
              />
            )}
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("filters")} disabled={busy}>
              Back
            </Button>
            <Button type="button" onClick={confirmAndTrigger} disabled={busy}>
              {busy ? <Spinner className="size-3.5" /> : <Check className="size-3.5" aria-hidden />}
              Confirm & start collecting
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ current }: { current: StepKey }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs" aria-label="Scrape request steps">
      {STEPS.map((s, index) => {
        const active = index === currentIndex;
        const done = index < currentIndex;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                active && "border-brand bg-brand/5 text-brand",
                done && !active && "border-brand/40 text-muted-foreground",
                !active && !done && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" aria-hidden /> : <span aria-hidden>{index + 1}</span>}
              {s.label}
            </span>
            {index < STEPS.length - 1 && <span className="text-border" aria-hidden>—</span>}
          </li>
        );
      })}
    </ol>
  );
}

function platformLabel(platform: string): string {
  return platform === "google_maps" ? "Google Maps" : platform.charAt(0).toUpperCase() + platform.slice(1);
}

function fieldLabel(schema: ActorTemplateRow["paramSchema"], key: string): string {
  return schema.find((f) => f.key === key)?.label ?? key;
}

function seedParams(template: ActorTemplateRow | undefined): string {
  if (!template) return "{}";
  const stub = Object.fromEntries(template.requiredParams.map((key) => [key, ""]));
  return JSON.stringify(stub, null, 2);
}
