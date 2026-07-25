"use client";

import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/spinner";
import { runDiscovery } from "@/application/datasets/dataset.actions";
import { useServerAction } from "@/hooks/use-server-action";
import { datasetsQueryKey } from "@/features/datasets/query-keys";

export function DiscoveryButton() {
  const { busyId, run } = useServerAction();

  async function discover() {
    await run("discovery", () => runDiscovery(), {
      errorFallback: "Discovery failed",
      invalidateKeys: [datasetsQueryKey],
      onSuccess: (data) => {
        toast.success(
          data.added > 0
            ? `Found ${data.added} new dataset${data.added === 1 ? "" : "s"} of ${data.seen}`
            : `No new datasets — ${data.seen} already tracked`,
        );
        if (data.errors.length) toast.error(data.errors[0]);
      },
    });
  }

  return (
    <Button size="sm" onClick={() => void discover()} disabled={busyId === "discovery"}>
      {busyId === "discovery" ? (
        <Spinner className="size-3.5" />
      ) : (
        <RefreshCw className="size-3.5" aria-hidden />
      )}
      Discover datasets
    </Button>
  );
}
