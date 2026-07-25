import { Construction } from "lucide-react";

/**
 * A real page instead of a 404 for a roadmap item that isn't built yet
 * (`docs/prd.md`'s roadmap) — `/pipeline`, `/intelligence` and `/admin/sync`
 * were linked from the nav with nothing behind them. Distinct from
 * `EmptyState`: this isn't "no results," it's "not built," and says so.
 */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-4 py-20 text-center">
      <Construction className="text-muted-foreground size-10" aria-hidden />
      <div>
        <p className="text-lg font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 max-w-md text-sm">{description}</p>
      </div>
    </div>
  );
}
