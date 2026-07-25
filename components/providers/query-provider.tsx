"use client";

import { QueryClient, QueryClientProvider, isServer } from "@tanstack/react-query";

/**
 * Client-side counterpart to `shared/query-client.ts`. Deliberately a
 * different `getQueryClient` implementation, not a shared function — on the
 * server we want a fresh client per request (no cross-request state leaking
 * between users), but in the browser we want exactly one client reused across
 * the whole session (recreating it on every render would drop the cache and
 * could trip Suspense).
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
