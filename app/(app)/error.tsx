"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/error-state";

/**
 * Catches errors thrown by pages under (app) — e.g. a query failing — while
 * keeping the surrounding shell (sidebar/topbar) intact, since layout.tsx
 * itself sits above this boundary and isn't affected by whatever broke below
 * it. `unstable_retry`, not `reset` — see app/error.tsx's comment.
 */
export default function AppSegmentError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] segment error", error);
  }, [error]);

  return (
    <div className="p-4 sm:p-6">
      <ErrorState
        title="This page couldn't load"
        description="Something went wrong fetching the data for this page. Try again, or use the sidebar to go elsewhere."
        onRetry={unstable_retry}
      />
    </div>
  );
}
