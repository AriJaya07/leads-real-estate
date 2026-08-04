import { cn } from "@/lib/utils";

/**
 * A single number is a form in its own right — a bar chart of six KPIs is worse
 * than six tiles. Value in tabular figures so columns of tiles align.
 */
export function StatTile({
  label,
  value,
  hint,
  emphasis = false,
  tone,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  emphasis?: boolean;
  /** Tints the value for a stat that needs attention (an SLA breach, a failure count) — same tone tokens `ScoreBadge`/`HealthPill` use. Colour is never the only signal: pair with a `hint` that says so in words. */
  tone?: "warn" | "bad";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card flex flex-col gap-1 rounded-xl border p-4",
        emphasis && "ring-brand/25 ring-1",
        className,
      )}
    >
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-2xl leading-none font-semibold tabular-nums",
          tone === "bad" && "text-[var(--health-bad-fg)]",
          tone === "warn" && "text-[var(--health-warn-fg)]",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}
