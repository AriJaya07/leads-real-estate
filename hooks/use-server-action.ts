"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

/** Shape `next-safe-action`'s client hooks/direct calls resolve to. */
interface SafeActionResult<T> {
  data?: T;
  serverError?: string;
  validationErrors?: unknown;
}

interface RunOptions<T> {
  onSuccess?: (data: T) => void;
  /** Shown when the action errored and didn't supply its own `serverError` message. */
  errorFallback?: string;
  /**
   * React Query cache(s) this mutation also affects, invalidated in addition to
   * (not instead of) `router.refresh()` — the server action already calls
   * `updateTag`/`revalidateTag` for the RSC cache, but that has no way to reach
   * the separate client-side React Query cache the leads/datasets views read
   * from. Partial keys match by prefix (`["leads"]` covers list/facets/stats).
   */
  invalidateKeys?: readonly QueryKey[];
}

/**
 * Wraps the busy-state + error-toast + `router.refresh()` pattern every admin
 * table action already needs. `id` is whatever the caller is toggling busy state
 * for (usually a row id) — kept generic rather than boolean so one hook instance
 * can drive a whole table without every row needing its own hook call.
 */
export function useServerAction() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Stable across renders (deps are themselves stable from useRouter/useQueryClient)
  // so a caller can safely depend on `run` in its own useCallback — see
  // features/datasets/components/dataset-table.tsx for why that matters for
  // row memoization.
  const run = useCallback(
    async function run<T>(
      id: string,
      action: () => Promise<SafeActionResult<T> | undefined>,
      options: RunOptions<T> = {},
    ): Promise<T | undefined> {
      setBusyId(id);
      const result = await action();
      setBusyId(null);

      if (!result || result.data === undefined) {
        toast.error(result?.serverError ?? options.errorFallback ?? "Something went wrong. Please try again.");
        return undefined;
      }

      options.onSuccess?.(result.data);
      for (const queryKey of options.invalidateKeys ?? []) {
        void queryClient.invalidateQueries({ queryKey });
      }
      startTransition(() => router.refresh());
      return result.data;
    },
    [router, queryClient],
  );

  return { busyId, run };
}
