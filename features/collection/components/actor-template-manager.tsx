"use client";

import { memo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/common/spinner";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import {
  createActorTemplate,
  setActorTemplateEnabled,
} from "@/application/collection/actor-templates.actions";
import { useServerAction } from "@/hooks/use-server-action";
import { SCRAPE_PLATFORMS } from "@/shared/constants";
import type { CategoryOption } from "@/application/categories/categories.queries";
import type { ActorTemplateRow } from "@/infrastructure/db/schema/collection";
import type { ActorParamField, ActorParamFieldType } from "@/domain/collection/actor-request";

const PARAM_FIELD_TYPES: ActorParamFieldType[] = ["text", "textarea", "url", "number", "select", "multiselect", "tags"];

/** Editing-only shape: `options` is edited as a comma-separated list (label = value, the common case) and parsed back into `ActorParamField.options` on submit. */
type EditableParamField = Omit<ActorParamField, "options"> & { optionsText: string };

function emptyParamField(): EditableParamField {
  return { key: "", label: "", type: "text", required: false, optionsText: "" };
}

function toActorParamField(field: EditableParamField): ActorParamField {
  const { optionsText, ...rest } = field;
  const options =
    (field.type === "select" || field.type === "multiselect") && optionsText.trim()
      ? optionsText
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => ({ label: v, value: v }))
      : undefined;
  return { ...rest, options };
}

/**
 * "Which Apify actor scrapes what" is a database row, not a deploy — this is the
 * admin surface for that row. Every real actor id an operator has subscribed to
 * on Apify gets registered here once; requesting a scrape (`RequestScrapeForm`)
 * only ever picks from what's registered. `categories` comes from the DB now
 * (`application/categories/categories.queries.ts`), not a static list.
 */
export function ActorTemplateManager({
  templates,
  categories,
}: {
  templates: ActorTemplateRow[];
  categories: CategoryOption[];
}) {
  const [showForm, setShowForm] = useState(templates.length === 0);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-3">
      {templates.length === 0 ? (
        <EmptyState
          title="No actor templates registered"
          description="Register an Apify actor (its id, default input and required params) to start collecting data."
        />
      ) : (
        <TemplateTable templates={templates} categoryById={categoryById} />
      )}

      {showForm ? (
        <NewTemplateForm categories={categories} onDone={() => setShowForm(false)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="self-start">
          <Plus className="size-3.5" aria-hidden />
          Register actor
        </Button>
      )}
    </div>
  );
}

function TemplateTable({
  templates,
  categoryById,
}: {
  templates: ActorTemplateRow[];
  categoryById: Map<string, CategoryOption>;
}) {
  const router = useRouter();
  const { busyId, run } = useServerAction();

  // useCallback (with `run` itself stable, see use-server-action.ts) so
  // TemplateRow's memoization actually bails out on renders unrelated to a
  // given row — same reasoning as DatasetTable's `sync`/`changeStatus`.
  const toggle = useCallback(
    async (template: ActorTemplateRow) => {
      await run(template.id, () => setActorTemplateEnabled({ id: template.id, enabled: !template.enabled }), {
        errorFallback: "Could not update actor template",
        onSuccess: () => {
          toast.success(`${template.name} is now ${template.enabled ? "disabled" : "enabled"}`);
          router.refresh();
        },
      });
    },
    [run, router],
  );

  return (
    <DataTable minWidth="min-w-[760px]">
      <DataTableHead>
        <th>Name</th>
        <th className="w-28">Platform</th>
        <th className="w-28">Category</th>
        <th>Actor id</th>
        <th className="w-24">Status</th>
        <th className="w-20">Actions</th>
      </DataTableHead>
      <tbody>
        {templates.map((template) => (
          <TemplateRow
            key={template.id}
            template={template}
            categoryById={categoryById}
            busy={busyId === template.id}
            toggle={toggle}
          />
        ))}
      </tbody>
    </DataTable>
  );
}

/**
 * Extracted and memoized for the same reason `DatasetTable`'s `DatasetRow` is
 * (features/datasets/components/dataset-table.tsx): `busyId` toggling
 * re-renders `TemplateTable`, but only the busy row's own `busy` prop
 * actually changes — every other row's props stay referentially identical.
 */
const TemplateRow = memo(function TemplateRow({
  template,
  categoryById,
  busy,
  toggle,
}: {
  template: ActorTemplateRow;
  categoryById: Map<string, CategoryOption>;
  busy: boolean;
  toggle: (template: ActorTemplateRow) => void;
}) {
  return (
    <tr className="border-border border-t align-middle">
      <td className="px-3 py-2.5">
        <div className="font-medium">{template.name}</div>
        <div className="text-muted-foreground text-xs">{template.requirementKind}</div>
      </td>
      <td className="px-3 py-2.5 text-sm capitalize">{template.platform}</td>
      <td className="px-3 py-2.5 text-sm">
        {template.categoryId ? (
          (categoryById.get(template.categoryId)?.label ?? "Unknown")
        ) : (
          <span className="text-muted-foreground">All</span>
        )}
      </td>
      <td className="text-muted-foreground px-3 py-2.5 font-mono text-xs">{template.actorId}</td>
      <td className="px-3 py-2.5">
        <Badge variant={template.enabled ? "default" : "outline"}>
          {template.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </td>
      <td className="px-3 py-2.5">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => toggle(template)}>
          {busy && <Spinner className="size-3.5" />}
          {template.enabled ? "Disable" : "Enable"}
        </Button>
      </td>
    </tr>
  );
});

function NewTemplateForm({ categories, onDone }: { categories: CategoryOption[]; onDone: () => void }) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<string>(SCRAPE_PLATFORMS[0]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [requirementKind, setRequirementKind] = useState("");
  const [actorId, setActorId] = useState("");
  const [description, setDescription] = useState("");
  const [defaultInputText, setDefaultInputText] = useState("{}");
  const [requiredParamsText, setRequiredParamsText] = useState("");
  const [costNote, setCostNote] = useState("");
  const [paramSchema, setParamSchema] = useState<EditableParamField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = busyId === "new-actor-template";

  function updateField(index: number, patch: Partial<EditableParamField>) {
    setParamSchema((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  function removeField(index: number) {
    setParamSchema((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let defaultInput: Record<string, unknown>;
    try {
      defaultInput = defaultInputText.trim() ? JSON.parse(defaultInputText) : {};
    } catch {
      setError("Default input must be valid JSON.");
      return;
    }
    setError(null);

    const requiredParams = requiredParamsText
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);

    const cleanedParamSchema = paramSchema
      .filter((f) => f.key.trim() && f.label.trim())
      .map(toActorParamField);
    if (paramSchema.length > 0 && cleanedParamSchema.length !== paramSchema.length) {
      setError("Every filter field needs a key and a label, or remove it.");
      return;
    }

    await run(
      "new-actor-template",
      () =>
        createActorTemplate({
          name,
          platform,
          categoryId: categoryId || null,
          requirementKind,
          actorId,
          description: description || undefined,
          defaultInput,
          requiredParams,
          paramSchema: cleanedParamSchema,
          costNote: costNote || undefined,
        }),
      {
        errorFallback: "Could not register actor template",
        onSuccess: () => {
          toast.success(`Registered "${name}"`);
          router.refresh();
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="border-border flex flex-col gap-3 rounded-xl border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Instagram — hashtag posts"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-platform">Platform</Label>
          <select
            id="template-platform"
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm capitalize"
          >
            {SCRAPE_PLATFORMS.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-category">Category</Label>
          <select
            id="template-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-requirement">Requirement kind</Label>
          <Input
            id="template-requirement"
            value={requirementKind}
            onChange={(event) => setRequirementKind(event.target.value)}
            placeholder="hashtag_search"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-actor-id">Apify actor id</Label>
          <Input
            id="template-actor-id"
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
            placeholder="apify/instagram-scraper"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-description">Description</Label>
        <Input
          id="template-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Shown to whoever requests a scrape"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-required-params">Required params (comma-separated)</Label>
        <Input
          id="template-required-params"
          value={requiredParamsText}
          onChange={(event) => setRequiredParamsText(event.target.value)}
          placeholder="directUrls, resultsLimit"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Filter fields (owner-facing &quot;Configure filters&quot; form)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setParamSchema((prev) => [...prev, emptyParamField()])}
          >
            <Plus className="size-3.5" aria-hidden />
            Add field
          </Button>
        </div>
        {paramSchema.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No filter fields yet — requesters will edit requirements as raw JSON. Add fields to give them a proper
            form instead (e.g. &quot;Search location&quot;, &quot;Groups to scrape&quot;).
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {paramSchema.map((field, index) => (
              <div key={index} className="border-border grid gap-2 rounded-lg border p-2.5 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
                <Input
                  value={field.key}
                  onChange={(event) => updateField(index, { key: event.target.value })}
                  placeholder="key (e.g. searchQuery)"
                  aria-label="Field key"
                />
                <Input
                  value={field.label}
                  onChange={(event) => updateField(index, { label: event.target.value })}
                  placeholder="Label shown to the requester"
                  aria-label="Field label"
                />
                <select
                  value={field.type}
                  onChange={(event) => updateField(index, { type: event.target.value as ActorParamFieldType })}
                  className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
                  aria-label="Field type"
                >
                  {PARAM_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 px-1 text-xs whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => updateField(index, { required: event.target.checked })}
                  />
                  Required
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove field"
                  onClick={() => removeField(index)}
                >
                  <X className="size-3.5" aria-hidden />
                </Button>
                {(field.type === "select" || field.type === "multiselect") && (
                  <Input
                    value={field.optionsText}
                    onChange={(event) => updateField(index, { optionsText: event.target.value })}
                    placeholder="Options, comma-separated (e.g. restaurant, hotel, villa)"
                    className="sm:col-span-5"
                    aria-label="Field options"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-default-input">Default input (JSON)</Label>
        <Textarea
          id="template-default-input"
          value={defaultInputText}
          onChange={(event) => setDefaultInputText(event.target.value)}
          rows={4}
          className="font-mono text-xs"
          spellCheck={false}
        />
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-cost-note">Cost note</Label>
        <Input
          id="template-cost-note"
          value={costNote}
          onChange={(event) => setCostNote(event.target.value)}
          placeholder="~$2.30 per 1,000 results"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner className="size-3.5" />}
          Register
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
