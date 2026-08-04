"use client";

import { memo, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Archive, Pause, Play, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HealthPill } from "@/components/common/health-pill";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { Spinner } from "@/components/common/spinner";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { runSync, setDatasetStatus } from "@/application/datasets/dataset.actions";
import { useServerAction } from "@/hooks/use-server-action";
import type { DatasetSummary } from "@/application/datasets/dataset-queries";
import { cn } from "@/lib/utils";
import { formatCount } from "@/shared/format";
import { datasetsQueryKey } from "@/features/datasets/query-keys";

/** Same "error, degraded or drifted" definition `getSyncOverview`'s `needsAttention` count uses. */
const ATTENTION_HEALTH = new Set(["schema_drift", "error", "degraded"]);

export function DatasetTable({ datasets }: { datasets: DatasetSummary[] }) {
  const [query, setQuery] = useState("");
  const { busyId, run } = useServerAction();

  const filtered = datasets.filter((dataset) =>
    `${dataset.label} ${dataset.externalId}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  // Independent of the search box on purpose — this flags datasets that need
  // a human regardless of what's currently filtered into view.
  const needsAttention = useMemo(
    () => datasets.filter((dataset) => ATTENTION_HEALTH.has(dataset.health)),
    [datasets],
  );

  // useCallback (with `run` itself now stable, see use-server-action.ts) so
  // DatasetRow's memoization actually bails out on renders unrelated to a
  // given row — the same reason LeadInbox's `contact` handler is memoized.
  const sync = useCallback(
    async (dataset: DatasetSummary) => {
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
    },
    [run],
  );

  const changeStatus = useCallback(
    async (dataset: DatasetSummary, status: "active" | "paused" | "archived") => {
      await run(dataset.id, () => setDatasetStatus({ datasetId: dataset.id, status }), {
        invalidateKeys: [datasetsQueryKey, ["leads"]],
        onSuccess: () => toast.success(`${dataset.label} is now ${status}`),
      });
    },
    [run],
  );

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
      {needsAttention.length > 0 && (
        <div className="border-border bg-[var(--health-warn-bg)]/50 flex items-start gap-3 rounded-xl border p-3">
          <AlertTriangle className="text-[var(--health-warn-fg)] mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">
              {needsAttention.length} dataset{needsAttention.length === 1 ? "" : "s"} need
              {needsAttention.length === 1 ? "s" : ""} attention:
            </span>{" "}
            {needsAttention.slice(0, 3).map((dataset, index) => (
              <span key={dataset.id}>
                {index > 0 && ", "}
                <Link href={`/admin/sync/${dataset.id}`} className="hover:underline">
                  {dataset.label}
                </Link>
              </span>
            ))}
            {needsAttention.length > 3 && ` and ${needsAttention.length - 3} more`}
          </p>
        </div>
      )}

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

      <DataTable minWidth="min-w-[900px]">
        <DataTableHead>
          <th>Dataset</th>
          <th className="w-32">Health</th>
          <th className="w-24">Items</th>
          <th className="w-24">Leads</th>
          <th className="w-24">Buyers</th>
          <th className="w-32">Last sync</th>
          <th className="w-40">Mapping</th>
          <th className="w-36">Actions</th>
        </DataTableHead>
        <tbody>
          {filtered.map((dataset) => (
            <DatasetRow
              key={dataset.id}
              dataset={dataset}
              busy={busyId === dataset.id}
              sync={sync}
              changeStatus={changeStatus}
            />
          ))}
        </tbody>
      </DataTable>

      <p className="text-muted-foreground text-xs">
        Mapping profiles are still reviewed as JSON — a visual mapping editor is next up on the
        roadmap, right after buyer-side data sourcing.
      </p>
    </div>
  );
}

/**
 * Extracted and memoized for the same reason `LeadRow`/`LeadCard` are
 * (features/leads/components/lead-inbox.tsx): `busyId` changing re-renders
 * `DatasetTable`, but only the busy row's own `busy` prop actually changes —
 * every other row's props are referentially identical before and after, so
 * `memo` turns that into a bailout instead of a full re-render. See
 * docs/tech-debt.md's (resolved) "Admin table row memoization" entry.
 */
const DatasetRow = memo(function DatasetRow({
  dataset,
  busy,
  sync,
  changeStatus,
}: {
  dataset: DatasetSummary;
  busy: boolean;
  sync: (dataset: DatasetSummary) => void;
  changeStatus: (dataset: DatasetSummary, status: "active" | "paused" | "archived") => void;
}) {
  return (
    <tr
      className={cn("border-border border-t align-middle", dataset.status !== "active" && "opacity-60")}
    >
      <td className="px-3 py-2.5">
        <Link href={`/admin/sync/${dataset.id}`} className="font-medium hover:underline">
          {dataset.label}
        </Link>
        <div className="text-muted-foreground font-mono text-xs">
          {dataset.externalId}
          {dataset.status !== "active" && ` · ${dataset.status}`}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <HealthPill health={dataset.health} detail={dataset.healthDetail} />
      </td>
      <td className="px-3 py-2.5 font-mono tabular-nums">{formatCount(dataset.itemCount)}</td>
      <td className="px-3 py-2.5 font-mono tabular-nums">{formatCount(dataset.leadCount)}</td>
      <td className="px-3 py-2.5 font-mono tabular-nums">{formatCount(dataset.buyerCount)}</td>
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
            disabled={busy}
            onClick={() => void sync(dataset)}
          >
            {busy ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label={dataset.status === "active" ? "Pause" : "Activate"}
            disabled={busy}
            onClick={() => void changeStatus(dataset, dataset.status === "active" ? "paused" : "active")}
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
            disabled={busy || dataset.status === "archived"}
            onClick={() => void changeStatus(dataset, "archived")}
          >
            <Archive className="size-3.5" aria-hidden />
          </Button>
        </div>
      </td>
    </tr>
  );
});
