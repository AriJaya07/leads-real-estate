"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/common/spinner";
import { EmptyState } from "@/components/common/empty-state";
import { requestScrape } from "@/application/collection/scrape-requests.actions";
import { useServerAction } from "@/hooks/use-server-action";
import type { ActorTemplateRow } from "@/infrastructure/db/schema/collection";

/**
 * The product's core workflow, steps 1-4: pick a source (platform), pick
 * requirements (a template within that platform, plus its params), and submit —
 * the system already knows which actor to call and how (`buildActorInput` in
 * `domain/collection/actor-request.ts`). Params are edited as JSON rather than
 * one input per key because a template is admin-registered against an arbitrary
 * Apify actor — there's no fixed shape to build a typed form against, the same
 * reason `mapping_profiles.rules` and `sources.config` are JSON too.
 */
export function RequestScrapeForm({ templates }: { templates: ActorTemplateRow[] }) {
  const router = useRouter();
  const { busyId, run } = useServerAction();

  const platforms = useMemo(
    () => Array.from(new Set(templates.map((t) => t.platform))).sort(),
    [templates],
  );
  const [platform, setPlatform] = useState(platforms[0] ?? "");
  const templatesForPlatform = useMemo(
    () => templates.filter((t) => t.platform === platform),
    [templates, platform],
  );
  const [templateId, setTemplateId] = useState(templatesForPlatform[0]?.id ?? "");
  const template = templatesForPlatform.find((t) => t.id === templateId) ?? templatesForPlatform[0];

  const [paramsText, setParamsText] = useState(() => seedParams(template));
  const [error, setError] = useState<string | null>(null);
  const busy = busyId === "request-scrape";

  function selectPlatform(next: string) {
    setPlatform(next);
    const first = templates.find((t) => t.platform === next);
    setTemplateId(first?.id ?? "");
    setParamsText(seedParams(first));
    setError(null);
  }

  function selectTemplate(next: ActorTemplateRow | undefined) {
    setTemplateId(next?.id ?? "");
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!template) return;

    let params: Record<string, unknown>;
    try {
      params = paramsText.trim() ? JSON.parse(paramsText) : {};
    } catch {
      setError("Requirements must be valid JSON.");
      return;
    }
    setError(null);

    await run("request-scrape", () => requestScrape({ actorTemplateId: template.id, params }), {
      errorFallback: "Could not start the scrape",
      onSuccess: (data) => {
        toast.success(
          data.reused
            ? `Reusing an in-flight/recent request for ${template.name} — no new Apify run started`
            : `Started collecting ${template.name}`,
        );
        router.refresh();
      },
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scrape-platform">Data source</Label>
          <select
            id="scrape-platform"
            value={platform}
            onChange={(event) => selectPlatform(event.target.value)}
            className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm capitalize"
          >
            {platforms.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scrape-requirement">Requirement</Label>
          <select
            id="scrape-requirement"
            value={template?.id ?? ""}
            onChange={(event) => selectTemplate(templatesForPlatform.find((t) => t.id === event.target.value))}
            className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
          >
            {templatesForPlatform.map((t) => (
              <option key={t.id} value={t.id}>
                {t.requirementKind} — {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {template?.description && <p className="text-muted-foreground text-sm">{template.description}</p>}
      {template?.costNote && (
        <p className="text-muted-foreground text-xs">
          <span className="font-medium">Cost:</span> {template.costNote}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="scrape-params">
          Requirements {template && template.requiredParams.length > 0 ? `(required: ${template.requiredParams.join(", ")})` : "(JSON)"}
        </Label>
        <Textarea
          id="scrape-params"
          value={paramsText}
          onChange={(event) => setParamsText(event.target.value)}
          rows={6}
          className="font-mono text-xs"
          spellCheck={false}
        />
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      <Button type="submit" disabled={busy || !template} className="self-start">
        {busy && <Spinner className="size-3.5" />}
        Start collecting
      </Button>
    </form>
  );
}

function seedParams(template: ActorTemplateRow | undefined): string {
  if (!template) return "{}";
  const stub = Object.fromEntries(template.requiredParams.map((key) => [key, ""]));
  return JSON.stringify(stub, null, 2);
}
