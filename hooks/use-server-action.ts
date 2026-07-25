"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
}

/**
 * Wraps the busy-state + error-toast + `router.refresh()` pattern every admin
 * table action already needs. `id` is whatever the caller is toggling busy state
 * for (usually a row id) — kept generic rather than boolean so one hook instance
 * can drive a whole table without every row needing its own hook call.
 */
export function useServerAction() {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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
    startTransition(() => router.refresh());
    return result.data;
  }

  return { busyId, run };
}
