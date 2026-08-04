import { cn } from "@/lib/utils";
import type { ScoreReason } from "@/domain/scoring/types";

function tone(score: number): string {
  if (score >= 70) return "bg-[var(--score-high-bg)] text-[var(--score-high-fg)]";
  if (score >= 40) return "bg-[var(--score-mid-bg)] text-[var(--score-mid-fg)]";
  return "bg-[var(--score-low-bg)] text-[var(--score-low-fg)]";
}

/**
 * Score plus its reasoning. A naked number gets ignored; "82 because it says
 * 'looking to buy' and states a budget" gets acted on.
 */
export function ScoreBadge({
  score,
  label = "intent",
  className,
}: {
  score: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
        tone(score),
        className,
      )}
      title={`${label} score ${score}/100`}
    >
      {score}
    </span>
  );
}

export function ScoreReasons({
  reasons,
  limit = 3,
  showWeight = false,
  className,
}: {
  reasons: ScoreReason[];
  limit?: number;
  /** Shows each reason's point contribution ("+24") — the detail sheet's "argue with the score" view. */
  showWeight?: boolean;
  className?: string;
}) {
  const shown = reasons.filter((r) => r.weight > 0).slice(0, limit);
  if (shown.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((reason) => (
        <li
          key={reason.code + reason.label}
          className="text-muted-foreground border-border/60 flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-4"
          title={reason.evidence ?? undefined}
        >
          {reason.label}
          {showWeight && <span className="text-foreground font-mono font-medium">+{reason.weight}</span>}
        </li>
      ))}
    </ul>
  );
}
