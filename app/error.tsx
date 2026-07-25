"use client";

import { useEffect } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { ErrorState } from "@/components/common/error-state";

/**
 * Root error boundary — catches anything not caught by a more specific
 * segment boundary (see app/(app)/error.tsx). `unstable_retry`, not `reset` —
 * Next 16 renamed it; see AGENTS.md before "fixing" this back.
 */
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] uncaught error", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <BrandMark className="size-10" />
        <ErrorState
          title="Something went wrong"
          description="An unexpected error stopped this page from loading. Reloading usually fixes it."
          onRetry={unstable_retry}
        />
      </div>
    </main>
  );
}
