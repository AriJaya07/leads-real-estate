import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  healthy: "bg-[var(--health-ok-bg)] text-[var(--health-ok-fg)]",
  stale: "bg-[var(--health-warn-bg)] text-[var(--health-warn-fg)]",
  degraded: "bg-[var(--health-warn-bg)] text-[var(--health-warn-fg)]",
  schema_drift: "bg-[var(--health-drift-bg)] text-[var(--health-drift-fg)]",
  error: "bg-[var(--health-bad-bg)] text-[var(--health-bad-fg)]",
  unknown: "bg-muted text-muted-foreground",
};

const LABELS: Record<string, string> = {
  healthy: "Healthy",
  stale: "Stale",
  degraded: "Degraded",
  schema_drift: "Schema drift",
  error: "Error",
  unknown: "Not synced",
};

export function HealthPill({
  health,
  detail,
  className,
}: {
  health: string;
  detail?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[health] ?? TONES.unknown,
        className,
      )}
      title={detail ?? undefined}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {LABELS[health] ?? health}
    </span>
  );
}
