import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Poppins } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * One typeface for body and headings, at a weight range wide enough to carry
 * both (400/500 for body copy, 600/700 for headings and emphasis) — simpler
 * and more consistent than pairing two families, and one less font to load.
 */
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
/**
 * Companion display face for the marketing site only — eyebrow labels, big
 * numerals, pull-quotes. Never used for body copy or the product app.
 */
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "DreamRue Lead Intelligence",
    template: "%s · DreamRue",
  },
  description:
    "Real estate lead intelligence for Bali: automatically syncs every Apify and n8n dataset, scores buyer intent, and gets the sales team to high-intent buyers first.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <QueryProvider>
          <a
            href="#main-content"
            className="bg-background text-foreground focus-visible:ring-ring sr-only rounded-md border px-4 py-2 text-sm font-medium focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:ring-3"
          >
            Skip to content
          </a>
          <NuqsAdapter>{children}</NuqsAdapter>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
