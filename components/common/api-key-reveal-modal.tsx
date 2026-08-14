"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * One-time secret reveal — the standard, non-negotiable API-key UX pattern:
 * shown once, copyable, never re-displayable and never emailed in full.
 * Dismiss is disabled until the "I've saved this key" box is ticked, and the
 * dialog can't be dismissed by outside click/escape — a secret this page
 * will never show again shouldn't be closeable by accident.
 */
export function ApiKeyRevealModal({
  open,
  secret,
  label = "Copy your key now",
  onDone,
}: {
  open: boolean;
  secret: string | null;
  label?: string;
  onDone: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(secret ?? "");
    toast.success("Copied");
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) return; // block outside-click/escape close — only "Done" below closes it
      }}
    >
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-semibold">{label}</AlertDialogTitle>
          <AlertDialogDescription>
            This is the only time the full value will be shown. We store a hash — we cannot show it again, and we
            will never email it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-start gap-2">
          <code className="bg-muted border-border min-w-0 flex-1 rounded-md border px-3 py-2 font-mono text-sm break-all">
            {secret}
          </code>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => void copy()}>
            <Copy className="size-3.5" aria-hidden />
            Copy
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="border-input size-3.5 rounded"
          />
          I&rsquo;ve saved this key somewhere safe.
        </label>

        <AlertDialogFooter>
          <Button
            disabled={!confirmed}
            onClick={() => {
              setConfirmed(false);
              onDone();
            }}
          >
            Done
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
