import { sql, type SQL } from "drizzle-orm";
import { leadRecordKindEnum, leadStatusEnum, leadTypeEnum } from "@/infrastructure/db/schema/enums";

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
export type LeadTypeValue = (typeof leadTypeEnum.enumValues)[number];

export function validLeadTypes(values: string[]): LeadTypeValue[] {
  const allowed = new Set<string>(leadTypeEnum.enumValues);
  return values.filter((value): value is LeadTypeValue => allowed.has(value));
}

export type LeadStatusValue = (typeof leadStatusEnum.enumValues)[number];

export function validStatuses(values: string[]): LeadStatusValue[] {
  const allowed = new Set<string>(leadStatusEnum.enumValues);
  return values.filter((value): value is LeadStatusValue => allowed.has(value));
}

export type LeadRecordKindValue = (typeof leadRecordKindEnum.enumValues)[number];

export function validRecordKinds(values: string[]): LeadRecordKindValue[] {
  const allowed = new Set<string>(leadRecordKindEnum.enumValues);
  return values.filter((value): value is LeadRecordKindValue => allowed.has(value));
}
