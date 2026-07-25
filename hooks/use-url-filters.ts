"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Shared URL-as-state logic for the lead search/filter/sort/pagination system.
 * Writes go through `history.pushState`/`replaceState` — Next's documented
 * "shallow routing on the client" pattern — rather than `router.push`, so a
 * filter change updates the URL (shareable, back/forward-able) *without*
 * triggering a server round-trip. React Query owns the actual data fetch now
 * (`features/leads/queries.ts`), keyed on these same params; a `router.push`
 * here would mean paying for both a server re-render *and* a client fetch on
 * every keystroke. `useSearchParams()` still reflects the URL correctly after
 * a `pushState` — Next's router patches `history` globally for exactly this.
 *
 * Only `LeadInbox`/`LeadFilterBar` use this. If a future consumer needs URL
 * state backed by a plain server re-render instead of a client query, don't
 * reuse this hook for it — shallow routing with nothing client-side listening
 * for the change just silently does nothing.
 */
export function useUrlFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = useCallback(
    (next: URLSearchParams) => {
      window.history.pushState(null, "", `${pathname}?${next}`);
    },
    [pathname],
  );

  /** Mutates the current params and resets pagination — any filter change starts back at page 1. */
  const setParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.delete("page");
      push(next);
    },
    [searchParams, push],
  );

  /** Navigates to a specific page without touching any other filter. */
  const goToPage = useCallback(
    (page: number) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("page", String(page));
      push(next);
    },
    [searchParams, push],
  );

  return { searchParams, setParams, goToPage };
}
