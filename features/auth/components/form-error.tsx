import { AlertTriangle } from "lucide-react";

/**
 * Shared inline error treatment for every auth form. Replaces the old bare
 * `text-destructive text-sm` line with the boxed alert the doc uses for the
 * sign-in "wrong password" state — reuses the `destructive` bg/text pairing
 * already established in `components/ui/button.tsx`'s destructive variant.
 */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
