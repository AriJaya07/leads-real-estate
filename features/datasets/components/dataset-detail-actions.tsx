"use client";

import { useRouter } from "next/navigation";
import { Archive, Pause, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/spinner";
import { runSync, setDatasetStatus } from "@/application/datasets/dataset.actions";
import { useServerAction } from "@/hooks/use-server-action";
import { datasetsQueryKey } from "@/features/datasets/query-keys";
import type { DatasetRow } from "@/infrastructure/db/schema/catalog";

/** Same actions as `DatasetTable`'s row buttons, spelled out with labels for a detail page. */
export function DatasetDetailActions({
  datasetId,
  status,
}: {
  datasetId: string;
  status: DatasetRow["status"];
}) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const busy = busyId !== null;

  async function sync() {
    await run(datasetId, () => runSync({ datasetId, force: true }), {
      errorFallback: "Sync failed",
      invalidateKeys: [datasetsQueryKey, ["leads"]],
      onSuccess: (outcome) => {
        toast[outcome.status === "failed" ? "error" : "success"](
          `${outcome.status} — ${outcome.itemsNew} new item(s), ${outcome.leadsCreated} lead(s)`,
          { description: outcome.reason },
        );
        router.refresh();
      },
    });
  }

  async function changeStatus(next: "active" | "paused" | "archived") {
    await run(datasetId, () => setDatasetStatus({ datasetId, status: next }), {
      invalidateKeys: [datasetsQueryKey, ["leads"]],
      onSuccess: () => {
        toast.success(`Dataset is now ${next}`);
        router.refresh();
      },
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void sync()}>
        {busy ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />}
        Sync now
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void changeStatus(status === "active" ? "paused" : "active")}
      >
        {status === "active" ? (
          <Pause className="size-3.5" aria-hidden />
        ) : (
          <Play className="size-3.5" aria-hidden />
        )}
        {status === "active" ? "Pause" : "Activate"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || status === "archived"}
        onClick={() => void changeStatus("archived")}
      >
        <Archive className="size-3.5" aria-hidden />
        Archive
      </Button>
    </div>
  );
}
