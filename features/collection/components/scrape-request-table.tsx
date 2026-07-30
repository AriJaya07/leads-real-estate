"use client";

import { memo, useCallback } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/spinner";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { ScrapeStatusPill } from "@/components/common/scrape-status-pill";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { refreshScrapeStatus } from "@/application/collection/scrape-requests.actions";
import { useServerAction } from "@/hooks/use-server-action";
import { formatCount } from "@/shared/format";
import type { ScrapeRequestRow } from "@/infrastructure/db/schema/collection";

const REFRESHABLE = new Set(["queued", "running"]);

export function ScrapeRequestTable({ requests }: { requests: ScrapeRequestRow[] }) {
  const { busyId, run } = useServerAction();

  const refresh = useCallback(
    async (request: ScrapeRequestRow) => {
      await run(request.id, () => refreshScrapeStatus({ id: request.id }), {
        errorFallback: "Could not check run status",
      });
    },
    [run],
  );

  if (requests.length === 0) {
    return (
      <EmptyState
        title="No scrape requests yet"
        description="Requests you start above show up here, with status, item counts and cost."
      />
    );
  }

  return (
    <DataTable minWidth="min-w-[860px]">
      <DataTableHead>
        <th>Requested</th>
        <th>Template</th>
        <th className="w-28">Status</th>
        <th className="w-24">Items</th>
        <th className="w-24">Cost</th>
        <th className="w-28">Actions</th>
      </DataTableHead>
      <tbody>
        {requests.map((request) => (
          <ScrapeRequestRowView
            key={request.id}
            request={request}
            busy={busyId === request.id}
            refresh={refresh}
          />
        ))}
      </tbody>
    </DataTable>
  );
}

const ScrapeRequestRowView = memo(function ScrapeRequestRowView({
  request,
  busy,
  refresh,
}: {
  request: ScrapeRequestRow;
  busy: boolean;
  refresh: (request: ScrapeRequestRow) => void;
}) {
  return (
    <tr className="border-border border-t align-middle">
      <td className="text-muted-foreground px-3 py-2.5 text-xs">
        <RelativeTime value={request.requestedAt} />
      </td>
      <td className="px-3 py-2.5">
        <div className="font-medium">{request.templateName}</div>
        <div className="text-muted-foreground text-xs capitalize">
          {request.platform} · {request.requirementKind}
        </div>
        {request.datasetId && (
          <Link href={`/admin/sync/${request.datasetId}`} className="text-xs hover:underline">
            View dataset
          </Link>
        )}
      </td>
      <td className="px-3 py-2.5">
        <ScrapeStatusPill status={request.status} />
        {request.errorSummary && (
          <div className="text-destructive mt-1 max-w-[220px] truncate text-xs" title={request.errorSummary}>
            {request.errorSummary}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 font-mono tabular-nums">{formatCount(request.itemCount)}</td>
      <td className="px-3 py-2.5 font-mono tabular-nums">
        {request.usageUsd !== null ? `$${request.usageUsd.toFixed(3)}` : "—"}
      </td>
      <td className="px-3 py-2.5">
        {REFRESHABLE.has(request.status) && (
          <Button
            size="icon"
            variant="outline"
            aria-label={`Check status for ${request.templateName}`}
            disabled={busy}
            onClick={() => refresh(request)}
          >
            {busy ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />}
          </Button>
        )}
      </td>
    </tr>
  );
});
