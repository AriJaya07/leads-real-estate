import "server-only";
import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { cache } from "react";

/**
 * One `QueryClient` per request, used only for server-side prefetching
 * (`queryClient.prefetchQuery` + `dehydrate` + `<HydrationBoundary>`) — never
 * for actually serving data to a client. React's `cache()` scopes this to a
 * single render pass, the same mechanism `application/auth/current-user.ts`
 * uses to dedupe `currentUser()` — without it, every Server Component that
 * calls `getQueryClient()` would get its own client and prefetching wouldn't
 * dehydrate anything.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Matches the freshness the old RSC-only version had: a filter change
        // was always a fresh fetch, never served from a stale client cache.
        staleTime: 30_000,
      },
      dehydrate: {
        // Include queries still in flight when the server render completes —
        // the client picks them up already-loading instead of re-issuing them.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });
}

export const getQueryClient = cache(makeQueryClient);
