import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Cache Components: `use cache` + `cacheLife` + `cacheTag`, with Partial
   * Prerendering as the default. Replaces `unstable_cache`, which Next 16
   * deprecates, and gives us per-dataset cache tags so syncing one dataset
   * never invalidates another's cached aggregates.
   */
  cacheComponents: true,

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Scraped post images come from the Facebook / Instagram CDNs, not Apify.
      // These URLs are signed and expire, so a broken image is expected over time.
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.apify.com" },
    ],
  },

  experimental: {
    optimizePackageImports: ["lucide-react", "@tanstack/react-query", "date-fns"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
