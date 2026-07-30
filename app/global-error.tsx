"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Catches errors thrown by the root layout itself (`app/layout.tsx`) — a font
 * failing to load, a provider throwing during render, etc. `app/error.tsx`
 * does NOT cover this case: a segment's `error.tsx` only catches errors in
 * that segment and below, never in the layout that renders alongside it. Per
 * Next's own requirement, this file replaces the entire document (own
 * `<html>`/`<body>`) rather than relying on the root layout, since the root
 * layout is exactly what might have failed. Deliberately dependency-light —
 * no `ThemeProvider`, no shared components — so this boundary can't itself
 * fail the same way the thing it's catching did.
 *
 * `unstable_retry`, not `reset` — Next 16 renamed it; see AGENTS.md before
 * "fixing" this back (same note as app/error.tsx).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] uncaught root-layout error", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <main
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "100dvh",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>Something went wrong</h1>
            <p style={{ color: "#666", margin: 0, maxWidth: "28rem" }}>
              DreamRue hit an unexpected error and couldn&apos;t load. Reloading usually fixes it.
              {error.digest && (
                <>
                  <br />
                  <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Reference: {error.digest}</span>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                border: "1px solid #d0d5dd",
                borderRadius: "0.5rem",
                padding: "0.5rem 1rem",
                background: "#111827",
                color: "#fff",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
