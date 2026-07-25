"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <AlertTriangle className="text-destructive size-10" aria-hidden />
      <div>
        <p className="text-lg font-medium">{title}</p>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
