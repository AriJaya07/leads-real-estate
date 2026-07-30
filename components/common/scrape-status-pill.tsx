import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-[var(--health-drift-bg)] text-[var(--health-drift-fg)]",
  succeeded: "bg-[var(--health-ok-bg)] text-[var(--health-ok-fg)]",
  failed: "bg-[var(--health-bad-bg)] text-[var(--health-bad-fg)]",
  aborted: "bg-[var(--health-bad-bg)] text-[var(--health-bad-fg)]",
  timed_out: "bg-[var(--health-warn-bg)] text-[var(--health-warn-fg)]",
};

const LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  aborted: "Aborted",
  timed_out: "Timed out",
};

/** Same shape as `HealthPill`/`SyncStatusPill`, over the `scrape_request_status` enum. */
export function ScrapeStatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[status] ?? TONES.queued,
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
