"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runDiscovery } from "@/application/datasets/dataset.actions";
import { useServerAction } from "@/hooks/use-server-action";

export function DiscoveryButton() {
  const { busyId, run } = useServerAction();

  async function discover() {
    await run("discovery", () => runDiscovery(), {
      errorFallback: "Discovery failed",
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
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="size-3.5" aria-hidden />
      )}
      Discover datasets
    </Button>
  );
}
