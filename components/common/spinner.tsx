import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The `<Loader2 className="animate-spin" aria-hidden />` markup repeated
 * verbatim across every busy-state button (dataset sync, discovery, add
 * team member, forms) — one place to keep it instead of six.
 */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin", className)} aria-hidden />;
}
