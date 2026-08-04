import { cn } from "@/lib/utils";

/**
 * Same three-tier semantic palette as `ScoreBadge`/`HealthPill` — under 70% is
 * "OK", 70-90% is "Watch", 90%+ is "At limit". Reused verbatim rather than a
 * fourth ad hoc color scheme (billing usage, API key status, webhook delivery
 * all share this rule).
 */
function tone(pct: number): { bar: string; label: string; text: string } {
  if (pct >= 90) return { bar: "bg-[var(--health-bad-fg)]", label: "At limit", text: "text-[var(--health-bad-fg)]" };
  if (pct >= 70) return { bar: "bg-[var(--health-warn-fg)]", label: "Watch", text: "text-[var(--health-warn-fg)]" };
  return { bar: "bg-[var(--health-ok-fg)]", label: "OK", text: "text-[var(--health-ok-fg)]" };
}

export function UsageMeter({
  label,
  used,
  limit,
  formatValue = (n) => n.toLocaleString("en-US"),
  className,
}: {
  label: string;
  used: number;
  /** `null` renders as unlimited — no bar, no percentage. */
  limit: number | null;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  if (limit === null) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground">{formatValue(used)} · unlimited</span>
        </div>
      </div>
    );
  }

  const pct = limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const { bar, label: statusLabel, text } = tone(pct);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatValue(used)} / {formatValue(limit)} · {pct}%
        </span>
      </div>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-xs font-medium", text)}>{statusLabel}</span>
    </div>
  );
}
