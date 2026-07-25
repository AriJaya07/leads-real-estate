import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Matches `StatTile`'s shape — used as the loading fallback for stat rows. */
export function StatRowSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-5", className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
