import type { Metadata } from "next";

/** Auth screens (login/signup/reset/invite) stay out of search results, same as the app shell. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
