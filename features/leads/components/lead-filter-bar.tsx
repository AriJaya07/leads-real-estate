"use client";

import { Filter, LayoutGrid, RotateCcw, Search, Sparkles, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { triageFilters } from "@/application/leads/filters.schema";
import type { FacetDescriptor } from "@/application/leads/facets";

/**
 * Renders whatever facets the server discovered. There is no hardcoded list of
 * property types, locations or statuses here — a dataset that introduces a new
 * category produces a new chip on the next request, with no code change.
 */
export function LeadFilterBar({
  facets,
  activeCount,
  isFetching,
}: {
  facets: FacetDescriptor[];
  activeCount: number;
  isFetching: boolean;
}) {
  const { searchParams: params, setParams: update } = useUrlFilters();
  const view = params.get("view") === "cards" ? "cards" : "table";

  function toggleMulti(key: string, value: string) {
    update((next) => {
      const current = (next.get(key) ?? "").split(",").filter(Boolean);
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (updated.length) next.set(key, updated.join(","));
      else next.delete(key);
    });
  }

  const isActive = (key: string, value: string) =>
    (params.get(key) ?? "").split(",").filter(Boolean).includes(value);

  const enumFacets = facets.filter((f) => f.kind === "enum");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            defaultValue={params.get("q") ?? ""}
            placeholder="Search posts, authors, groups…"
            className="pl-8"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const value = event.currentTarget.value.trim();
              update((next) => (value ? next.set("q", value) : next.delete("q")));
            }}
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            update((next) => {
              // `triageFilters()` is the single definition of what "triage mode"
              // means (application/leads/filters.schema.ts) — looping over it
              // here instead of hardcoding the fields keeps this button correct
              // if that definition ever changes.
              for (const [key, value] of Object.entries(triageFilters())) {
                next.set(key, Array.isArray(value) ? value.join(",") : String(value));
              }
            })
          }
        >
          <Sparkles className="size-3.5" aria-hidden />
          Triage view
        </Button>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              update((next) => {
                const datasetId = next.get("datasetId");
                for (const key of [...next.keys()]) next.delete(key);
                if (datasetId) next.set("datasetId", datasetId);
              })
            }
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
            <Badge variant="secondary">{activeCount}</Badge>
          </Button>
        )}

        {isFetching && (
          <span className="text-muted-foreground text-xs" role="status" aria-live="polite">
            Updating…
          </span>
        )}

        {/* Below md the layout is always cards (a fixed-column table can't fit),
            so the choice is meaningless there — desktop only. */}
        <div className="border-border hidden shrink-0 items-center gap-0.5 rounded-lg border p-0.5 md:flex">
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Table view"
            aria-pressed={view === "table"}
            onClick={() => update((next) => next.delete("view"))}
          >
            <Table2 className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant={view === "cards" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Card view"
            aria-pressed={view === "cards"}
            onClick={() => update((next) => next.set("view", "cards"))}
          >
            <LayoutGrid className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className={cn("flex flex-col gap-2", isFetching && "opacity-60")}>
        {enumFacets.map((facet) => (
          <div key={facet.key} className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground inline-flex w-28 shrink-0 items-center gap-1 text-xs font-medium">
              <Filter className="size-3" aria-hidden />
              {facet.label}
            </span>
            {facet.options.slice(0, 12).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive(facet.key, option.value)}
                onClick={() => toggleMulti(facet.key, option.value)}
                className={cn(
                  "border-border rounded-full border px-2.5 py-1 text-xs transition-colors",
                  isActive(facet.key, option.value)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent",
                )}
              >
                {option.label}
                <span className="ml-1 font-mono opacity-60 tabular-nums">{option.count}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
