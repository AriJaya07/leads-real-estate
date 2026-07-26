"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { configureSync } from "@/application/datasets/dataset.actions";
import { useServerAction } from "@/hooks/use-server-action";
import { MAX_SYNC_INTERVAL_SECONDS, MIN_SYNC_INTERVAL_SECONDS } from "@/shared/constants";

/**
 * The adaptive scheduler (`domain/sync/scheduling.ts`) tightens/loosens this
 * automatically per dataset — this base interval is the floor it works from,
 * not a fixed cadence.
 */
export function SyncIntervalForm({
  datasetId,
  autoSyncEnabled: initialEnabled,
  syncIntervalSeconds,
}: {
  datasetId: string;
  autoSyncEnabled: boolean;
  syncIntervalSeconds: number;
}) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [minutes, setMinutes] = useState(Math.round(syncIntervalSeconds / 60));
  const busy = busyId === datasetId;

  const minMinutes = Math.ceil(MIN_SYNC_INTERVAL_SECONDS / 60);
  const maxMinutes = Math.floor(MAX_SYNC_INTERVAL_SECONDS / 60);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      datasetId,
      () =>
        configureSync({
          datasetId,
          autoSyncEnabled: enabled,
          syncIntervalSeconds: minutes * 60,
        }),
      {
        errorFallback: "Could not update sync settings",
        onSuccess: () => {
          toast.success("Sync settings updated");
          router.refresh();
        },
      },
    );
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="border-input size-4 rounded"
        />
        Auto-sync
      </label>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sync-interval">Base interval (minutes)</Label>
        <Input
          id="sync-interval"
          type="number"
          min={minMinutes}
          max={maxMinutes}
          value={minutes}
          disabled={!enabled}
          onChange={(event) => setMinutes(Number(event.target.value))}
          className="w-28"
        />
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        {busy && <Spinner className="size-3.5" />}
        Save
      </Button>
    </form>
  );
}
