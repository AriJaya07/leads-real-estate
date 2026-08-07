"use client";

import { useCallback, useRef } from "react";

/**
 * Roving DOM focus over a list of rows: each row is individually
 * `tabIndex={0}`, and j/k/arrow keys move real browser focus between them via
 * refs rather than tracking a separate "focused index" in state — the
 * natively-focused row already is the source of truth, so a screen reader
 * announces it for free without needing `aria-activedescendant` plumbing.
 * Generalizes the index-tracking `CommandPalette`'s own arrow-key handler
 * does ad hoc and inline, so a second list (the lead inbox) doesn't
 * reimplement it. Never required — rows stay clickable and tappable exactly
 * as before; this only adds a keyboard path on top.
 *
 * `count` is only read inside callbacks (never during render), so a shrinking
 * list never needs the ref array itself mutated at render time — `focusIndex`
 * simply clamps against the current `count` before touching a ref.
 */
export function useListKeyboardNav(count: number) {
  const rowRefs = useRef<(HTMLElement | null)[]>([]);

  const setRowRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      rowRefs.current[index] = el;
    },
    [],
  );

  const focusIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, count - 1));
      rowRefs.current[clamped]?.focus();
    },
    [count],
  );

  const moveFocus = useCallback(
    (currentIndex: number, delta: 1 | -1) => {
      focusIndex(currentIndex + delta);
    },
    [focusIndex],
  );

  return { setRowRef, moveFocus, focusIndex };
}
