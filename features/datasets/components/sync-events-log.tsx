import { format } from "date-fns";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";

type SyncEvent = {
  id: string;
  level: string;
  stage: string;
  message: string;
  context: Record<string, unknown> | null;
  at: Date;
};

const LEVEL_TONE: Record<string, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-[var(--health-warn-fg)]",
  error: "text-[var(--health-bad-fg)]",
};

/**
 * One sync run's structured log, in order. This is the same `{ level, stage,
 * message, ...context }` shape `infrastructure/observability/logger.ts`
 * generalized from — `SyncLogger` is the one place that still writes
 * structured rows straight to the database instead of through it, since these
 * need to survive as queryable history, not just a log line.
 */
export function SyncEventsLog({ events }: { events: SyncEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No log lines for this run" />;
  }

  return (
    <ol className="border-border divide-border flex flex-col divide-y rounded-xl border font-mono text-xs">
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2">
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {format(event.at, "HH:mm:ss.SSS")}
          </span>
          <span className={cn("shrink-0 font-semibold uppercase", LEVEL_TONE[event.level])}>
            {event.level}
          </span>
          <span className="text-muted-foreground shrink-0">[{event.stage}]</span>
          <span className="min-w-0 flex-1 break-words">{event.message}</span>
          {event.context && Object.keys(event.context).length > 0 && (
            <span className="text-muted-foreground w-full pl-1 break-all">
              {JSON.stringify(event.context)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
