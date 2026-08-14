"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ActorTemplateForm, ActorTemplateTable } from "@/features/collection/components/actor-template-registry";
import { registerSourceTemplate, setSourceTemplateEnabled } from "@/application/platform/sources.actions";
import { cn } from "@/lib/utils";
import type { CategoryOption } from "@/application/categories/categories.queries";
import type { ActorTemplateRow } from "@/infrastructure/db/schema/collection";
import type { SourcePlatformSummary } from "@/application/platform/sources.queries";

const PLATFORM_LABELS: Record<string, string> = {
  google_maps: "Google Maps",
  tiktok: "TikTok",
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

/**
 * Super Admin's "which sources exist and are turned on, platform-wide" view —
 * every curated platform (`SCRAPE_PLATFORMS`) shown as its own card even with
 * zero templates ("not yet configured"), so Instagram/TikTok/etc. read as
 * things this platform *could* support rather than disappearing until an
 * admin happens to add one. Below the cards: the same register form/table
 * `ActorTemplateManager` uses at `/admin/collection`, wired to the
 * platform-audited actions instead — see `actor-template-registry.tsx`.
 */
export function SourceRegistryManager({
  templates,
  categories,
  byPlatform,
  usageByTemplate,
}: {
  templates: ActorTemplateRow[];
  categories: CategoryOption[];
  byPlatform: SourcePlatformSummary[];
  usageByTemplate: Map<string, number>;
}) {
  const [showForm, setShowForm] = useState(false);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {byPlatform.map((p) => {
          const configured = p.total > 0;
          const anyEnabled = p.enabled > 0;
          return (
            <div
              key={p.platform}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg border px-3 py-2.5",
                configured ? "border-border" : "border-border border-dashed",
              )}
            >
              <span className="text-sm font-medium">{platformLabel(p.platform)}</span>
              <span className={cn("text-xs", anyEnabled ? "text-brand" : "text-muted-foreground")}>
                {configured ? `${p.enabled}/${p.total} enabled` : "Not configured"}
              </span>
            </div>
          );
        })}
      </div>

      {templates.length === 0 ? (
        <EmptyState
          title="No sources registered"
          description="Register an Apify actor for a source (Instagram, TikTok, Facebook, ...) so tenants can request a scrape against it."
        />
      ) : (
        <ActorTemplateTable
          templates={templates}
          categoryById={categoryById}
          toggleEnabled={setSourceTemplateEnabled}
          usageByTemplate={usageByTemplate}
        />
      )}

      {showForm ? (
        <ActorTemplateForm categories={categories} submitAction={registerSourceTemplate} onDone={() => setShowForm(false)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="self-start">
          <Plus className="size-3.5" aria-hidden />
          Register source
        </Button>
      )}
    </div>
  );
}
