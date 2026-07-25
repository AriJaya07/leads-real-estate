/**
 * Formatting helpers pinned to an explicit locale.
 *
 * Bare `toLocaleString()` uses the *runtime's* locale, which is the server's on
 * the first render and the browser's afterwards. On an Indonesian machine that
 * turns 1,234 into 1.234 between SSR and hydration — a mismatch React cannot
 * patch up. Pinning the locale makes the output identical on both sides.
 */

const LOCALE = "en-US";

const integer = new Intl.NumberFormat(LOCALE);
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact" });

export function formatCount(value: number): string {
  return integer.format(value);
}

export function formatCompact(value: number): string {
  return compact.format(value);
}

/** Durations are rendered as text, never as a locale-dependent number. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}
