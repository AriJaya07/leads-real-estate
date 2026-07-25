// src/components/common/error-state.tsx
"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
      <AlertTriangle className="size-10 text-destructive" aria-hidden />
      <p className="text-lg font-medium">Something went wrong loading listings.</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}