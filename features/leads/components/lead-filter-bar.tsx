"use client";

import { Download, EyeOff, Filter, LayoutGrid, Menu, RotateCcw, Search, Sparkles, Star, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useHasMounted } from "@/hooks/use-has-mounted";
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

  // `isFetching` reflects real-time query state that can differ between the
  // server's one-shot render and the client's first paint (a hydration
  // mismatch — the "Updating…" indicator showing/hiding shifts every sibling
  // after it in the tree). Gate it on `useHasMounted()`: SSR and the client's
  // *first* render both see `false` (identical output, hydration succeeds),
  // then a normal client-only re-render picks up the real value.
  const showFetchingIndicator = useHasMounted() && isFetching;

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

  // Shared between the desktop inline row and the mobile sheet below — only
  // one of the two is ever visible at a given viewport width, so duplicating
  // the JSX (not the state) is simplest and each copy stays a plain
  // uncontrolled input keyed off the same URL params.
  const scoreAndDateControls = (
    <>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground text-xs font-medium">Min lead score</span>
        <Input
          type="number"
          min={0}
          max={100}
          defaultValue={params.get("minLeadScore") ?? ""}
          placeholder="0"
          className="w-16"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const value = event.currentTarget.value.trim();
            update((next) => (value ? next.set("minLeadScore", value) : next.delete("minLeadScore")));
          }}
        />
      </div>

      <div className="flex items-center gap-1">
        <span className="text-muted-foreground text-xs font-medium">Collected</span>
        <Input
          type="date"
          defaultValue={params.get("collectedAfter") ?? ""}
          className="w-36"
          aria-label="Collected after"
          onChange={(event) =>
            update((next) =>
              event.currentTarget.value
                ? next.set("collectedAfter", event.currentTarget.value)
                : next.delete("collectedAfter"),
            )
          }
        />
        <span className="text-muted-foreground text-xs">to</span>
        <Input
          type="date"
          defaultValue={params.get("collectedBefore") ?? ""}
          className="w-36"
          aria-label="Collected before"
          onChange={(event) =>
            update((next) =>
              event.currentTarget.value
                ? next.set("collectedBefore", event.currentTarget.value)
                : next.delete("collectedBefore"),
            )
          }
        />
      </div>
    </>
  );

  const actionButtons = (
    <>
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

      <Button
        variant={params.get("bookmarked") === "true" ? "secondary" : "outline"}
        size="sm"
        aria-pressed={params.get("bookmarked") === "true"}
        onClick={() =>
          update((next) =>
            next.get("bookmarked") === "true" ? next.delete("bookmarked") : next.set("bookmarked", "true"),
          )
        }
      >
        <Star className="size-3.5" aria-hidden />
        Favorites
      </Button>

      <Button
        variant={params.get("showHidden") === "true" ? "secondary" : "outline"}
        size="sm"
        aria-pressed={params.get("showHidden") === "true"}
        title="Leads an automation rule hid from the default inbox"
        onClick={() =>
          update((next) =>
            next.get("showHidden") === "true" ? next.delete("showHidden") : next.set("showHidden", "true"),
          )
        }
      >
        <EyeOff className="size-3.5" aria-hidden />
        Hidden
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

      <Button variant="outline" size="sm" render={<a href={`/api/leads/export?${params.toString()}`} download />}>
        <Download className="size-3.5" aria-hidden />
        Export CSV
      </Button>
    </>
  );

  const facetChips = (
    <div className={cn("flex flex-col gap-2", showFetchingIndicator && "opacity-60")}>
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
  );

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
            placeholder="Search by name, company, location or category…"
            className="pl-8"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const value = event.currentTarget.value.trim();
              update((next) => (value ? next.set("q", value) : next.delete("q")));
            }}
          />
        </div>

        {/* md and up: every control inline. Below md there isn't room, so it
            collapses behind the ≡ sheet trigger instead. */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {scoreAndDateControls}
          {actionButtons}
        </div>

        {showFetchingIndicator && (
          <span className="text-muted-foreground text-xs" role="status" aria-live="polite">
            Updating…
          </span>
        )}

        <Sheet>
          <SheetTrigger
            render={
              <Button variant="outline" size="icon-sm" className="relative shrink-0 md:hidden" aria-label="Filters">
                <Menu className="size-4" aria-hidden />
                {activeCount > 0 && (
                  <span className="bg-brand absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white">
                    {activeCount}
                  </span>
                )}
              </Button>
            }
          />
          <SheetContent side="left" className="flex flex-col gap-4 overflow-y-auto p-4">
            <SheetHeader className="p-0">
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col items-start gap-2">{scoreAndDateControls}</div>
            <div className="flex flex-wrap items-center gap-2">{actionButtons}</div>
            {facetChips}
          </SheetContent>
        </Sheet>

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

      {/* Desktop-only — the mobile copy of the same facet chips lives inside the sheet above. */}
      <div className="hidden md:block">{facetChips}</div>
    </div>
  );
}
