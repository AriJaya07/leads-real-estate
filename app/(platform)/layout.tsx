import type { Metadata } from "next";

/** Platform-operator screens stay out of search results, same as the tenant app shell. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Deliberately not nested under `(app)`'s layout — that shell (`AppSidebar`/
 * `AppTopbar`) assumes exactly one company in scope (dataset switcher, nav
 * badges, etc.), which is the opposite of what a cross-company view needs.
 * No custom chrome beyond that: this is a single-operator internal tool, not
 * a product surface — same "no more UI than the job needs" restraint
 * `docs/saas-platform-architecture.md` already applies to the billing UI.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="mx-auto min-h-dvh max-w-5xl px-4 py-10 sm:px-6">
      {children}
    </main>
  );
}
