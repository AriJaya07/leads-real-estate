"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * False during SSR and the client's first paint (so both agree — no
 * hydration mismatch), true on every render after. Same sanctioned pattern
 * as `useLocalStorageValue` for state that legitimately differs between
 * server and client: `useSyncExternalStore`, not a `useEffect` + `setState`
 * (which the lint config's `set-state-in-effect` rule blocks for exactly
 * this reason — see that hook's comment).
 *
 * Use to gate any bit of UI whose *value* is correct but whose *timing*
 * can't be known during SSR (e.g. a live query's `isFetching` flag).
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
