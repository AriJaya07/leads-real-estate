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
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  emphasis?: boolean;
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
      <span className="font-mono text-2xl leading-none font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}
