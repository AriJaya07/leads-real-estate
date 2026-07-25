import { sql, type SQL } from "drizzle-orm";
import { leadIntentEnum, leadStatusEnum } from "@/infrastructure/db/schema/enums";

/**
 * Builds a genuine `text[]` parameter.
 *
 * Interpolating a JS array directly into a `sql` template binds it as a single
 * scalar, so Postgres receives `new` where it expects `{new}` and fails with
 * `Array value must start with "{"`. Expanding to `ARRAY[$1, $2, …]` keeps every
 * element an individually bound parameter — no string concatenation, no
 * injection surface.
 */
export function textArray(values: string[]): SQL {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * Filter values arrive from the URL, so they can be anything. Passing an unknown
 * string to an enum column makes Postgres raise `invalid input value for enum`,
 * turning a hand-edited query string into a 500.
 */
export function validIntents(values: string[]): ("buyer" | "seller" | "agent" | "other")[] {
  const allowed = new Set<string>(leadIntentEnum.enumValues);
  return values.filter((value): value is "buyer" | "seller" | "agent" | "other" =>
    allowed.has(value),
  );
}

export type LeadStatusValue = (typeof leadStatusEnum.enumValues)[number];

export function validStatuses(values: string[]): LeadStatusValue[] {
  const allowed = new Set<string>(leadStatusEnum.enumValues);
  return values.filter((value): value is LeadStatusValue => allowed.has(value));
}
