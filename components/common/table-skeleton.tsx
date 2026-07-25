import { Skeleton } from "@/components/ui/skeleton";

/**
 * Matches the shape of the table-based screens (lead inbox, dataset registry,
 * team) — `SkeletonGrid`'s card-grid shape doesn't. A loading state that
 * doesn't resemble what's arriving causes a layout jump the moment real
 * content replaces it; this is sized to arrive already close to final layout.
 */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="border-border overflow-hidden rounded-xl border" aria-hidden>
      <div className="bg-muted/50 h-10 w-full" />
      <div className="divide-border divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3">
            <Skeleton className="h-4 w-10 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 shrink-0 sm:block" />
            <Skeleton className="hidden h-4 w-20 shrink-0 md:block" />
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
