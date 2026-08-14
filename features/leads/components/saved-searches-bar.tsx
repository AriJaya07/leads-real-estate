"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/common/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { createSavedView, deleteSavedView } from "@/application/leads/saved-views.actions";
import { savedViewsQueryKey } from "@/features/leads/query-keys";
import type { SavedViewRow } from "@/infrastructure/db/schema/leads";

/**
 * A saved search is a name over a `URLSearchParams` snapshot — the exact
 * entries `serializeLeadFilters` would produce, stored verbatim and re-applied
 * through the same `parseLeadFilters` every other entry point uses. No second
 * filter representation, no new query logic: applying one is the same
 * "replace the URL" the filter bar's own Reset button already does.
 */
export function SavedSearchesBar({
  views,
  currentUserId,
  canManageSharedSearches,
}: {
  views: SavedViewRow[];
  currentUserId: string;
  canManageSharedSearches: boolean;
}) {
  const { searchParams, setParams } = useUrlFilters();
  const { busyId, run } = useServerAction();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  function apply(view: SavedViewRow) {
    const filters = view.filters as Record<string, string>;
    setParams((next) => {
      const datasetId = next.get("datasetId");
      for (const key of [...next.keys()]) next.delete(key);
      if (datasetId) next.set("datasetId", datasetId);
      for (const [key, value] of Object.entries(filters)) next.set(key, value);
    });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filters = Object.fromEntries(searchParams.entries());

    await run(
      "save-search",
      () => createSavedView({ name, shared, filters, sort: searchParams.get("sort") ?? undefined }),
      {
        errorFallback: "Could not save this search",
        invalidateKeys: [savedViewsQueryKey()],
        onSuccess: () => {
          toast.success(`Saved "${name}"`);
          setName("");
          setShared(false);
          setShowForm(false);
        },
      },
    );
  }

  async function remove(view: SavedViewRow) {
    await run(view.id, () => deleteSavedView({ id: view.id }), {
      errorFallback: "Could not delete this saved search",
      invalidateKeys: [savedViewsQueryKey()],
      onSuccess: () => toast.success(`Deleted "${view.name}"`),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((view) => {
        const canDelete = view.ownerId === currentUserId || canManageSharedSearches;
        return (
          <span
            key={view.id}
            className="border-border bg-muted/40 flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
          >
            <button type="button" onClick={() => apply(view)} className="hover:underline">
              {view.name}
              {view.shared && <span className="text-muted-foreground"> · shared</span>}
            </button>
            {canDelete && (
              <button
                type="button"
                aria-label={`Delete saved search "${view.name}"`}
                disabled={busyId === view.id}
                onClick={() => void remove(view)}
                className="text-muted-foreground hover:text-foreground rounded-full p-0.5 disabled:pointer-events-none disabled:opacity-50"
              >
                <X className="size-3" aria-hidden />
              </button>
            )}
          </span>
        );
      })}

      {showForm ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-1.5">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this search"
            className="h-8 w-44 text-sm"
            autoFocus
            required
          />
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={shared}
              onChange={(event) => setShared(event.target.checked)}
              className="border-input size-3.5 rounded"
            />
            Share with team
          </label>
          <Button type="submit" size="sm" disabled={busyId === "save-search"}>
            {busyId === "save-search" && <Spinner className="size-3.5" />}
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Bookmark className="size-3.5" aria-hidden />
          Save search
        </Button>
      )}
    </div>
  );
}
