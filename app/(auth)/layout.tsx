import type { Metadata } from "next";

/** Auth screens (login/signup/reset/invite) stay out of search results, same as the app shell. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="bg-surface-alt grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
