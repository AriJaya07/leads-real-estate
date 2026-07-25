"use client";

import { Filter, RotateCcw, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { FacetDescriptor } from "@/application/leads/facets";

/**
 * Renders whatever facets the server discovered. There is no hardcoded list of
 * property types, locations or statuses here — a dataset that introduces a new
 * category produces a new chip on the next request, with no code change.
 */
export function LeadFilterBar({
  facets,
  activeCount,
}: {
  facets: FacetDescriptor[];
  activeCount: number;
}) {
  const { searchParams: params, pending, setParams: update } = useUrlFilters();

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
              next.set("intent", "buyer");
              next.set("status", "new");
              next.set("sort", "priority");
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

        {pending && <span className="text-muted-foreground text-xs">Updating…</span>}
      </div>

      <div className={cn("flex flex-col gap-2", pending && "opacity-60")}>
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
