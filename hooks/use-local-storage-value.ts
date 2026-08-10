"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * `localStorage` is external, mutable state — reading it during render (SSR
 * has no `window`) or writing it from inside a `useEffect` body both trip the
 * React Compiler's purity/set-state-in-effect rules. `useSyncExternalStore`
 * is the sanctioned way to subscribe a component to state that lives outside
 * React: `getServerSnapshot` returns `null` so SSR/first paint never touch
 * `window`, and `setLocalStorageValue` below fires a same-tab event because
 * the native `storage` event only fires in *other* tabs.
 */
const LOCAL_EVENT = "averonai:local-storage-set";

export function useLocalStorageValue(key: string): string | null {
  const subscribe = useCallback(
    (callback: () => void) => {
      const handler = (event: Event) => {
        if (event instanceof StorageEvent && event.key !== null && event.key !== key) return;
        callback();
      };
      window.addEventListener("storage", handler);
      window.addEventListener(LOCAL_EVENT, handler);
      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener(LOCAL_EVENT, handler);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => window.localStorage.getItem(key), [key]);
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setLocalStorageValue(key: string, value: string): void {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}
