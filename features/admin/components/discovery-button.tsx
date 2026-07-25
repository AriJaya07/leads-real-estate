"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runDiscovery } from "@/application/datasets/dataset.actions";

export function DiscoveryButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function discover() {
    setRunning(true);
    const result = await runDiscovery();
    setRunning(false);

    const data = result?.data;
    if (!data) {
      toast.error(result?.serverError ?? "Discovery failed");
      return;
    }
    toast.success(
      data.added > 0
        ? `Found ${data.added} new dataset${data.added === 1 ? "" : "s"} of ${data.seen}`
        : `No new datasets — ${data.seen} already tracked`,
    );
    if (data.errors.length) toast.error(data.errors[0]);
    router.refresh();
  }

  return (
    <Button size="sm" onClick={() => void discover()} disabled={running}>
      {running ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="size-3.5" aria-hidden />
      )}
      Discover datasets
    </Button>
  );
}
