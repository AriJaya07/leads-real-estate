"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/common/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { updateCategoryConfig } from "@/application/categories/categories.actions";
import type { CategoryDetail } from "@/application/categories/categories.queries";

const STATUS_OPTIONS = [
  { value: "active", label: "Active — shown at /signup" },
  { value: "beta", label: "Beta — hidden from signup, usable by existing/test tenants" },
  { value: "disabled", label: "Disabled — hidden from new signups" },
] as const;

/** The config surface on `/platform/categories/[category]` — status/presets/notes only, never the label/description (edit those by re-creating, they're user-facing copy). */
export function CategoryConfigForm({ detail }: { detail: CategoryDetail }) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const [status, setStatus] = useState<"active" | "beta" | "disabled">(detail.status);
  const [categoryFieldOptionsText, setCategoryFieldOptionsText] = useState(
    detail.filterPresets.categoryFieldOptions.join(", "),
  );
  const [locationOptionsText, setLocationOptionsText] = useState(detail.filterPresets.locationOptions.join(", "));
  const [internalNotes, setInternalNotes] = useState(detail.internalNotes ?? "");
  const busy = busyId === "update-category-config";

  function toList(text: string): string[] {
    return text
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      "update-category-config",
      () =>
        updateCategoryConfig({
          id: detail.id,
          status,
          categoryFieldOptions: toList(categoryFieldOptionsText),
          locationOptions: toList(locationOptionsText),
          internalNotes: internalNotes || undefined,
        }),
      {
        errorFallback: "Could not save category config",
        onSuccess: () => {
          toast.success(`Saved ${detail.label} config`);
          router.refresh();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="border-border flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-status">Status</Label>
        <Select id="category-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category-field-options">Filter suggestions — category field (comma-separated)</Label>
          <Input
            id="category-field-options"
            value={categoryFieldOptionsText}
            onChange={(event) => setCategoryFieldOptionsText(event.target.value)}
            placeholder="Villa, Land, Apartment, Townhouse"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category-location-options">Filter suggestions — locations (comma-separated)</Label>
          <Input
            id="category-location-options"
            value={locationOptionsText}
            onChange={(event) => setLocationOptionsText(event.target.value)}
            placeholder="Canggu, Ubud, Seminyak"
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Suggested values only — the underlying fields stay free text. Editing this never changes any tenant&apos;s
        already-tagged leads.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-internal-notes">Internal notes (Super Admin only, never shown to tenants)</Label>
        <Textarea
          id="category-internal-notes"
          value={internalNotes}
          onChange={(event) => setInternalNotes(event.target.value)}
          rows={3}
          placeholder="e.g. actor template X is a generic placeholder until a dedicated scraper is registered."
        />
      </div>

      <Button type="submit" size="sm" disabled={busy} className="self-start">
        {busy && <Spinner className="size-3.5" />}
        Save changes
      </Button>
    </form>
  );
}
