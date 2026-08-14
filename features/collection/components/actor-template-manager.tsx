"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ActorTemplateForm, ActorTemplateTable } from "@/features/collection/components/actor-template-registry";
import { createActorTemplate, setActorTemplateEnabled } from "@/application/collection/actor-templates.actions";
import type { CategoryOption } from "@/application/categories/categories.queries";
import type { ActorTemplateRow } from "@/infrastructure/db/schema/collection";

/**
 * "Which Apify actor scrapes what" is a database row, not a deploy — this is the
 * tenant-admin surface for that row. Every real actor id an operator has subscribed
 * to on Apify gets registered here once; requesting a scrape (`RequestScrapeForm`)
 * only ever picks from what's registered. `categories` comes from the DB now
 * (`application/categories/categories.queries.ts`), not a static list. The Super
 * Admin counterpart is `SourceRegistryManager` (`/platform/sources`) — same table,
 * same shared form/table UI (`actor-template-registry.tsx`), separately audited.
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
        <ActorTemplateTable templates={templates} categoryById={categoryById} toggleEnabled={setActorTemplateEnabled} />
      )}

      {showForm ? (
        <ActorTemplateForm categories={categories} submitAction={createActorTemplate} onDone={() => setShowForm(false)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="self-start">
          <Plus className="size-3.5" aria-hidden />
          Register actor
        </Button>
      )}
    </div>
  );
}
