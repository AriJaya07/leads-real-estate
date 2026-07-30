/**
 * A tiny, serialisable predicate language for alert rules.
 *
 * Rules live in the database as JSON so the sales team can retune "what counts as
 * a hot lead" without a deploy. Kept deliberately small: comparison, set
 * membership, and boolean composition. No arbitrary expressions — a rule engine
 * that can run code is a rule engine that can be exploited.
 */

export type ComparisonOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "contains"
  | "intersects"
  | "exists"
  | "within";

export interface Comparison {
  field: string;
  op: ComparisonOp;
  value?: unknown;
}

interface AllOf {
  all: Predicate[];
}
interface AnyOf {
  any: Predicate[];
}
interface NotOf {
  not: Predicate;
}

export type Predicate = Comparison | AllOf | AnyOf | NotOf;

function isAllOf(p: Predicate): p is AllOf {
  return "all" in p;
}
function isAnyOf(p: Predicate): p is AnyOf {
  return "any" in p;
}
function isNotOf(p: Predicate): p is NotOf {
  return "not" in p;
}
function isComparison(p: Predicate): p is Comparison {
  return "field" in p && "op" in p;
}

/** Wraps a flat list of comparisons in an `all` — what the alert-rule builder UI produces. */
export function buildAllOfPredicate(conditions: Comparison[]): Predicate {
  return { all: conditions };
}

/**
 * The inverse of `buildAllOfPredicate`: returns the flat comparison list if
 * `predicate` is exactly the shape the rule-builder UI can produce and edit
 * (a top-level `all` of plain comparisons, no nested `any`/`not`/`all`), or
 * `null` for anything hand-authored and more complex — e.g. the seeded
 * `PRIORITY_BUYER`-style rule with a nested `any` branch. The UI falls back to
 * a read-only view for those rather than risk re-saving a lossy
 * approximation of a rule it can't fully represent.
 */
export function flattenAllOf(predicate: Predicate): Comparison[] | null {
  if (!isAllOf(predicate)) return null;
  return predicate.all.every(isComparison) ? (predicate.all as Comparison[]) : null;
}

function readPath(subject: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      subject,
    );
}

/** Parses an ISO-8601 duration subset (`PT6H`, `P3D`, `PT30M`) into milliseconds. */
export function parseDurationMs(value: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) return null;
  const [, d, h, m, s] = match;
  if (!d && !h && !m && !s) return null;
  return (
    (Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(m ?? 0) * 60 + Number(s ?? 0)) * 1000
  );
}

function toComparable(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

function compare(actual: unknown, op: ComparisonOp, expected: unknown, now: number): boolean {
  switch (op) {
    case "exists":
      return actual !== null && actual !== undefined && actual !== "";
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual as never);
    case "nin":
      return Array.isArray(expected) && !expected.includes(actual as never);
    case "contains":
      if (Array.isArray(actual)) return actual.includes(expected as never);
      return typeof actual === "string" && actual.toLowerCase().includes(String(expected).toLowerCase());
    case "intersects": {
      if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
      const set = new Set(expected.map((v) => String(v).toLowerCase()));
      return actual.some((v) => set.has(String(v).toLowerCase()));
    }
    case "within": {
      // "posted within the last PT6H"
      const ms = typeof expected === "string" ? parseDurationMs(expected) : null;
      if (ms === null) return false;
      const at = actual instanceof Date ? actual.getTime() : Date.parse(String(actual));
      if (Number.isNaN(at)) return false;
      return now - at <= ms;
    }
    default: {
      const a = toComparable(actual);
      const b = toComparable(expected);
      if (a === null || b === null || typeof a !== typeof b) return false;
      if (op === "gt") return a > b;
      if (op === "gte") return a >= b;
      if (op === "lt") return a < b;
      if (op === "lte") return a <= b;
      return false;
    }
  }
}

export function evaluatePredicate(
  predicate: Predicate,
  subject: Record<string, unknown>,
  now: number = Date.now(),
): boolean {
  if (isAllOf(predicate)) return predicate.all.every((p) => evaluatePredicate(p, subject, now));
  if (isAnyOf(predicate)) return predicate.any.some((p) => evaluatePredicate(p, subject, now));
  if (isNotOf(predicate)) return !evaluatePredicate(predicate.not, subject, now);
  if (isComparison(predicate)) {
    return compare(readPath(subject, predicate.field), predicate.op, predicate.value, now);
  }
  return false;
}

/** Renders a rule as prose for the admin UI, so nobody has to read JSON. */
export function describePredicate(predicate: Predicate): string {
  if (isAllOf(predicate)) return predicate.all.map(describePredicate).join(" AND ");
  if (isAnyOf(predicate)) return `(${predicate.any.map(describePredicate).join(" OR ")})`;
  if (isNotOf(predicate)) return `NOT ${describePredicate(predicate.not)}`;
  if (isComparison(predicate)) {
    const value = Array.isArray(predicate.value)
      ? predicate.value.join(", ")
      : String(predicate.value ?? "");
    return `${predicate.field} ${predicate.op} ${value}`.trim();
  }
  return "";
}
