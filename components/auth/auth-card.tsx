import { BrandMark } from "@/components/brand/brand-mark";

/**
 * Shared chrome for every auth screen (login, signup, forgot/reset password,
 * invite): a bordered card with the wordmark lockup pinned to the top. Mirrors
 * the doc's per-panel card treatment — each auth route renders one of these
 * instead of a bare centered form.
 */
export function AuthCard({ children }: { children?: React.ReactNode }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-8 shadow-sm">
      <div className="mb-7 flex items-center gap-2">
        <BrandMark className="size-5" />
        <span className="text-[15px] font-semibold">AveronAi</span>
      </div>
      {children}
    </div>
  );
}
