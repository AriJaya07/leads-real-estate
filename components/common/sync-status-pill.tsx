import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  succeeded: "bg-[var(--health-ok-bg)] text-[var(--health-ok-fg)]",
  partial: "bg-[var(--health-warn-bg)] text-[var(--health-warn-fg)]",
  failed: "bg-[var(--health-bad-bg)] text-[var(--health-bad-fg)]",
  skipped: "bg-muted text-muted-foreground",
  running: "bg-[var(--health-drift-bg)] text-[var(--health-drift-fg)]",
};

const LABELS: Record<string, string> = {
  succeeded: "Succeeded",
  partial: "Partial",
  failed: "Failed",
  skipped: "Skipped",
  running: "Running",
};

/** Same shape as `HealthPill`, over the `sync_status` enum instead of `dataset_health`. */
export function SyncStatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[status] ?? TONES.skipped,
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full bg-current", status === "running" && "animate-pulse")}
        aria-hidden
      />
      {LABELS[status] ?? status}
    </span>
  );
}
