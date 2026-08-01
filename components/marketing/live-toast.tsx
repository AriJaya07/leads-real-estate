import { RadioTower } from "lucide-react";

/** Small floating mock notification — implies the pipeline is running, not static. */
export function LiveToast() {
  return (
    <div className="border-border bg-card/90 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs shadow-lg backdrop-blur">
      <span className="relative flex size-2">
        <span className="bg-accent-warm absolute inline-flex size-full animate-ping rounded-full opacity-75" />
        <span className="bg-accent-warm relative inline-flex size-2 rounded-full" />
      </span>
      <RadioTower className="text-muted-foreground size-3.5" aria-hidden />
      <span className="text-muted-foreground">
        <span className="text-foreground font-medium">3 new leads</span> synced · 2m ago
      </span>
    </div>
  );
}
