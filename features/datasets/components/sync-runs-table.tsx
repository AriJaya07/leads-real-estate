import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { SyncStatusPill } from "@/components/common/sync-status-pill";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { formatCount } from "@/shared/format";
import type { RecentSyncRun } from "@/application/datasets/dataset-queries";

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Shared between the cross-dataset activity feed (`/admin/sync`, `showDataset`)
 * and a single dataset's run history (`/admin/sync/[datasetId]`). Each row
 * links to that run's log on the dataset detail page — the same route in both
 * cases, since a dataset's own detail page is exactly where its run lives.
 */
export function SyncRunsTable({
  runs,
  showDataset = false,
}: {
  runs: RecentSyncRun[];
  showDataset?: boolean;
}) {
  if (runs.length === 0) {
    return <EmptyState title="No sync runs yet" description="Runs appear here once a dataset syncs." />;
  }

  return (
    <DataTable minWidth="min-w-[760px]">
      <DataTableHead>
        <th className="w-28">Status</th>
        {showDataset && <th>Dataset</th>}
        <th className="w-24">Trigger</th>
        <th className="w-36">Items</th>
        <th className="w-20">Leads</th>
        <th className="w-20">Duration</th>
        <th className="w-28">Started</th>
        <th className="w-10" />
      </DataTableHead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id} className="border-border hover:bg-accent/40 border-t">
            <td className="px-3 py-2.5">
              <SyncStatusPill status={run.status} />
            </td>
            {showDataset && (
              <td className="px-3 py-2.5 font-medium">
                <Link
                  href={`/admin/sync/${run.datasetId}?run=${run.id}`}
                  className="hover:underline"
                >
                  {run.datasetLabel}
                </Link>
              </td>
            )}
            <td className="text-muted-foreground px-3 py-2.5 text-xs capitalize">{run.trigger}</td>
            <td className="px-3 py-2.5 font-mono text-xs tabular-nums">
              {formatCount(run.itemsNew)} new / {formatCount(run.itemsSeen)} seen
            </td>
            <td className="px-3 py-2.5 font-mono text-xs tabular-nums">
              {formatCount(run.leadsCreated)}
            </td>
            <td className="text-muted-foreground px-3 py-2.5 text-xs">
              {formatDuration(run.durationMs)}
            </td>
            <td className="text-muted-foreground px-3 py-2.5 text-xs">
              <RelativeTime value={run.startedAt} />
            </td>
            <td className="px-3 py-2.5">
              <Link
                href={`/admin/sync/${run.datasetId}?run=${run.id}`}
                aria-label="View run log"
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
