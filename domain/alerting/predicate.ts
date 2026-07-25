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

export interface AllOf {
  all: Predicate[];
}
export interface AnyOf {
  any: Predicate[];
}
export interface NotOf {
  not: Predicate;
}

export type Predicate = Comparison | AllOf | AnyOf | NotOf;

export function isAllOf(p: Predicate): p is AllOf {
  return "all" in p;
}
export function isAnyOf(p: Predicate): p is AnyOf {
  return "any" in p;
}
export function isNotOf(p: Predicate): p is NotOf {
  return "not" in p;
}
export function isComparison(p: Predicate): p is Comparison {
  return "field" in p && "op" in p;
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
