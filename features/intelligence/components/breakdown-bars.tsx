import { cn } from "@/lib/utils";
import { formatCount } from "@/shared/format";

export interface BreakdownItem {
  label: string;
  count: number;
  /** Defaults to the shared magnitude hue — override per-item for identity encoding (e.g. intent). */
  colorClassName?: string;
}

/**
 * A ranked horizontal bar list — the correct form for "magnitude across named
 * categories" (top locations, property types, source groups, intent), per the
 * dataviz skill: a bar chart with each category already labeled on the axis
 * doesn't need a categorical palette, just one consistent hue per bar unless
 * the category itself carries meaning worth coloring (see `colorClassName`).
 */
export function BreakdownBars({ items }: { items: BreakdownItem[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No data yet.</p>;
  }

  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs" title={item.label}>
            {item.label}
          </span>
          <div
            className="bg-muted h-4 min-w-0 flex-1 overflow-hidden rounded"
            title={`${item.label}: ${formatCount(item.count)}`}
          >
            <div
              className={cn("h-full rounded", item.colorClassName ?? "bg-chart-1")}
              style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums">
            {formatCount(item.count)}
          </span>
        </li>
      ))}
    </ul>
  );
}
