import { createHash } from "node:crypto";
import type { FieldProfile, InferredType, SchemaDiff, SchemaFingerprint } from "./types";

/**
 * Infers the shape of an arbitrary upstream payload.
 *
 * This is the mechanism that turns a silent data-quality collapse into an alert:
 * a hand-written interface degrades to nulls when the upstream actor changes its
 * output, and nothing notices. A fingerprint over the discovered paths does.
 */

const MAX_SAMPLES = 5;
const MAX_DEPTH = 6;

function classify(value: unknown): InferredType {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "object") return "object";
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return "url";
    // Only treat as a date when it looks like ISO-8601 — `Date.parse` accepts far
    // too much ("Villa 3" parses in some engines) to be a useful signal.
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(value) && !Number.isNaN(Date.parse(value))) {
      return "date";
    }
    return "string";
  }
  return "mixed";
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

interface Accumulator {
  types: Set<InferredType>;
  present: number;
  nonEmpty: number;
  distinct: Set<string>;
  samples: unknown[];
}

function walk(
  value: unknown,
  path: string,
  acc: Map<string, Accumulator>,
  depth: number,
  seenInRecord: Set<string>,
): void {
  if (depth > MAX_DEPTH) return;

  const type = classify(value);

  if (type === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walk(child, path ? `${path}.${key}` : key, acc, depth + 1, seenInRecord);
    }
    return;
  }

  if (type === "array") {
    const array = value as unknown[];
    record(acc, path, "array", array, seenInRecord);
    // Profile the element shape under a `[]` suffix so `attachments[].photo_image.uri`
    // is addressable by a mapping rule.
    for (const element of array.slice(0, 20)) {
      walk(element, `${path}[]`, acc, depth + 1, seenInRecord);
    }
    return;
  }

  record(acc, path, type, value, seenInRecord);
}

function record(
  acc: Map<string, Accumulator>,
  path: string,
  type: InferredType,
  value: unknown,
  seenInRecord: Set<string>,
) {
  if (!path) return;
  let entry = acc.get(path);
  if (!entry) {
    entry = { types: new Set(), present: 0, nonEmpty: 0, distinct: new Set(), samples: [] };
    acc.set(path, entry);
  }

  if (type !== "null") entry.types.add(type);

  const empty = isEmpty(value);
  if (!empty) {
    const key = typeof value === "object" ? JSON.stringify(value).slice(0, 200) : String(value);
    if (entry.distinct.size < 5000) entry.distinct.add(key);
    if (entry.samples.length < MAX_SAMPLES) entry.samples.push(value);
  }

  /**
   * Presence is counted once per record, not once per array element. Counting
   * occurrences let `attachments[].ocrText` report a 6.0 fill rate on a payload
   * with six attachments, which then outranked the actual `text` field when
   * proposing a mapping — and silently mapped post bodies to image alt text.
   */
  if (seenInRecord.has(path)) return;
  seenInRecord.add(path);
  entry.present += 1;
  if (!empty) entry.nonEmpty += 1;
}

function resolveType(types: Set<InferredType>): InferredType {
  if (types.size === 0) return "null";
  if (types.size === 1) return [...types][0];
  // `url` is a refinement of `string`, so a mix of the two is still a string.
  const withoutUrl = new Set(types);
  if (withoutUrl.delete("url") && withoutUrl.size === 1 && withoutUrl.has("string")) return "string";
  return "mixed";
}

export function inferSchema(records: Record<string, unknown>[]): FieldProfile[] {
  const acc = new Map<string, Accumulator>();
  for (const record of records) walk(record, "", acc, 0, new Set());

  const total = records.length || 1;

  return [...acc.entries()]
    .map(([path, entry]) => ({
      path,
      type: resolveType(entry.types),
      nullable: entry.nonEmpty < total,
      fillRate: Number(Math.min(1, entry.nonEmpty / total).toFixed(4)),
      cardinality: entry.distinct.size,
      sampleValues: entry.samples,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Stable across sample order and value changes; moves only when the shape moves. */
export function fingerprintSchema(profiles: FieldProfile[]): SchemaFingerprint {
  const canonical = profiles
    .map((p) => `${p.path}:${p.type}`)
    .sort()
    .join("|");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export function diffSchema(previous: FieldProfile[], next: FieldProfile[]): SchemaDiff {
  const prev = new Map(previous.map((p) => [p.path, p]));
  const curr = new Map(next.map((p) => [p.path, p]));

  const added = [...curr.keys()].filter((p) => !prev.has(p)).sort();
  const removed = [...prev.keys()].filter((p) => !curr.has(p)).sort();
  const typeChanged = [...curr.entries()]
    .filter(([path, profile]) => {
      const before = prev.get(path);
      return before && before.type !== profile.type;
    })
    .map(([path, profile]) => ({
      path,
      from: prev.get(path)!.type,
      to: profile.type,
    }));

  return { added, removed, typeChanged };
}

export function isSchemaDrift(diff: SchemaDiff): boolean {
  // Added fields alone are additive and safe — passthrough will surface them.
  // Removed fields and type changes are what break an existing mapping.
  return diff.removed.length > 0 || diff.typeChanged.length > 0;
}
