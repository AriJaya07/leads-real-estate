import { format, formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Relative timestamps read from the clock, so the server and the browser can
 * legitimately disagree ("2 minutes ago" vs "3 minutes ago") whenever rendering
 * straddles a boundary. That difference is expected rather than a bug, so it is
 * suppressed here instead of being left to surface as a hydration error.
 *
 * The absolute time is kept in `dateTime` and `title`, so the exact value is
 * always recoverable and machine-readable.
 */
export function RelativeTime({
  value,
  className,
  fallback = "never",
}: {
  value: Date | string | null | undefined;
  className?: string;
  fallback?: string;
}) {
  if (!value) return <span className={className}>{fallback}</span>;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return <span className={className}>{fallback}</span>;

  return (
    <time
      dateTime={date.toISOString()}
      title={format(date, "d MMM yyyy, HH:mm")}
      className={cn("whitespace-nowrap", className)}
      suppressHydrationWarning
    >
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
  );
}
