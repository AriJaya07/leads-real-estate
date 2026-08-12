import type { Metadata } from "next";

/** Platform-operator screens stay out of search results, same as the tenant app shell. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Deliberately not nested under `(app)`'s layout — that shell (`AppSidebar`/
 * `AppTopbar`) assumes exactly one company in scope (dataset switcher, nav
 * badges, etc.), which is the opposite of what a cross-company view needs.
 * Full-width here on purpose: `PlatformShell` (rendered by each page, after
 * its own `requirePlatformAdmin()` check — see that component's comment on
 * why the check can't live in this layout) owns the sidebar + page chrome.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <div id="main-content">{children}</div>;
}
