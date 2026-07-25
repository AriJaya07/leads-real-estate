"use client";

import { useState } from "react";
import { Archive, Loader2, Pause, Play, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HealthPill } from "@/components/common/health-pill";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { runSync, setDatasetStatus } from "@/application/datasets/dataset.actions";
import { useServerAction } from "@/hooks/use-server-action";
import type { DatasetSummary } from "@/application/datasets/dataset-queries";
import { cn } from "@/lib/utils";
import { formatCount } from "@/shared/format";
import { datasetsQueryKey } from "@/features/datasets/queries";

export function DatasetTable({ datasets }: { datasets: DatasetSummary[] }) {
  const [query, setQuery] = useState("");
  const { busyId, run } = useServerAction();

  const filtered = datasets.filter((dataset) =>
    `${dataset.label} ${dataset.externalId}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function sync(dataset: DatasetSummary) {
    await run(dataset.id, () => runSync({ datasetId: dataset.id, force: true }), {
      errorFallback: "Sync failed",
      invalidateKeys: [datasetsQueryKey, ["leads"]],
      onSuccess: (outcome) => {
        toast[outcome.status === "failed" ? "error" : "success"](
          `${dataset.label}: ${outcome.status} — ${outcome.itemsNew} new item(s), ${outcome.leadsCreated} lead(s)`,
          { description: outcome.reason },
        );
      },
    });
  }

  async function changeStatus(dataset: DatasetSummary, status: "active" | "paused" | "archived") {
    await run(dataset.id, () => setDatasetStatus({ datasetId: dataset.id, status }), {
      invalidateKeys: [datasetsQueryKey, ["leads"]],
      onSuccess: () => toast.success(`${dataset.label} is now ${status}`),
    });
  }

  if (datasets.length === 0) {
    return (
      <EmptyState
        title="No datasets discovered yet"
        description="Run discovery to enumerate everything your connected sources expose."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search datasets…"
          className="pl-8"
        />
      </div>

      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>Dataset</th>
              <th className="w-32">Health</th>
              <th className="w-24">Items</th>
              <th className="w-24">Leads</th>
              <th className="w-24">Buyers</th>
              <th className="w-32">Last sync</th>
              <th className="w-40">Mapping</th>
              <th className="w-36">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((dataset) => (
              <tr
                key={dataset.id}
                className={cn(
                  "border-border border-t align-middle",
                  dataset.status !== "active" && "opacity-60",
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium">{dataset.label}</div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {dataset.externalId}
                    {dataset.status !== "active" && ` · ${dataset.status}`}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <HealthPill health={dataset.health} detail={dataset.healthDetail} />
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums">
                  {formatCount(dataset.itemCount)}
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums">
                  {formatCount(dataset.leadCount)}
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums">
                  {formatCount(dataset.buyerCount)}
                </td>
                <td className="text-muted-foreground px-3 py-2.5 text-xs">
                  <RelativeTime value={dataset.lastSyncedAt} />
                  <div>
                    {dataset.autoSyncEnabled
                      ? `every ~${Math.round(dataset.syncIntervalSeconds / 60)}m`
                      : "auto-sync off"}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {dataset.mappingProfileName ? (
                    <>
                      <div className="truncate">{dataset.mappingProfileName}</div>
                      {!dataset.mappingApproved && (
                        <div className="text-[var(--health-warn-fg)]">needs approval</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">none</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Sync ${dataset.label}`}
                      disabled={busyId === dataset.id}
                      onClick={() => void sync(dataset)}
                    >
                      {busyId === dataset.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="size-3.5" aria-hidden />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={dataset.status === "active" ? "Pause" : "Activate"}
                      disabled={busyId === dataset.id}
                      onClick={() =>
                        void changeStatus(dataset, dataset.status === "active" ? "paused" : "active")
                      }
                    >
                      {dataset.status === "active" ? (
                        <Pause className="size-3.5" aria-hidden />
                      ) : (
                        <Play className="size-3.5" aria-hidden />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Archive ${dataset.label}`}
                      disabled={busyId === dataset.id || dataset.status === "archived"}
                      onClick={() => void changeStatus(dataset, "archived")}
                    >
                      <Archive className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
