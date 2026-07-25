"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Shared URL-as-state logic for pages that keep filter/pagination state in
 * `searchParams` rather than a client store (see docs/architecture.md — this is
 * deliberate, not a gap to fill with global state). Pulled out because
 * `LeadInbox` and `LeadFilterBar` each hand-rolled their own copy of this exact
 * push-with-transition logic before this hook existed.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const push = useCallback(
    (next: URLSearchParams) => {
      startTransition(() => router.push(`${pathname}?${next}`, { scroll: false }));
    },
    [router, pathname],
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

  return { searchParams, pending, setParams, goToPage };
}
