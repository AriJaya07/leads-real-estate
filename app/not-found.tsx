import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/**
 * Root `not-found.tsx` handles every unmatched URL app-wide (Next 16 — no
 * per-segment file needed for this case, see the not-found.js file-conventions
 * doc). Not gated behind auth, since we don't know whether the visitor is
 * signed in — links to both destinations.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark className="size-10" />
        <SearchX className="text-muted-foreground size-10" aria-hidden />
        <div>
          <h1 className="text-lg font-medium">Page not found</h1>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
          </p>
        </div>
        <div className="flex gap-2">
          <Button render={<Link href="/leads">Go to inbox</Link>} />
          <Button variant="outline" render={<Link href="/login">Sign in</Link>} />
        </div>
      </div>
    </main>
  );
}
