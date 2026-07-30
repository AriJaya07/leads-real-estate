import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { textArray, validDataQualityTiers, validLeadTypes, validStatuses } from "./sql-helpers";

const dialect = new PgDialect();

function compile(fragment: ReturnType<typeof sql>) {
  return dialect.sqlToQuery(fragment);
}

describe("textArray", () => {
  /**
   * Regression: interpolating a JS array straight into a `sql` template bound it
   * as one scalar, so Postgres received `new` where it expected `{new}` and the
   * whole inbox 500'd with `Array value must start with "{"`.
   */
  it("binds each element as its own parameter", () => {
    const { sql: text, params } = compile(sql`status = ANY(${textArray(["new", "contacted"])})`);

    expect(params).toEqual(["new", "contacted"]);
    expect(text).toContain("ARRAY[");
    expect(text).toContain("::text[]");
    // Two placeholders, not one scalar carrying a comma-joined string.
    expect(text.match(/\$\d/g)).toHaveLength(2);
  });

  it("produces a typed empty array rather than invalid SQL", () => {
    const { sql: text, params } = compile(sql`x && ${textArray([])}`);
    expect(params).toEqual([]);
    expect(text).toContain("ARRAY[]::text[]");
  });

  it("never inlines values into the SQL string", () => {
    const { sql: text, params } = compile(sql`x && ${textArray(["'; drop table leads; --"])}`);
    expect(text).not.toContain("drop table");
    expect(params).toEqual(["'; drop table leads; --"]);
  });
});

describe("validLeadTypes / validStatuses", () => {
  it("keeps known enum values", () => {
    expect(validLeadTypes(["buyer", "seller"])).toEqual(["buyer", "seller"]);
    expect(validStatuses(["new", "contacted"])).toEqual(["new", "contacted"]);
  });

  /** A hand-edited query string must not reach an enum column and 500 the page. */
  it("drops values the enum does not accept", () => {
    expect(validLeadTypes(["buyer", "landlord", ""])).toEqual(["buyer"]);
    expect(validStatuses(["new", "deleted", "DROP TABLE"])).toEqual(["new"]);
  });

  it("returns an empty list when nothing is valid", () => {
    expect(validLeadTypes(["nope"])).toEqual([]);
    expect(validStatuses(["nope"])).toEqual([]);
  });
});

describe("validDataQualityTiers", () => {
  it("keeps known tiers and drops the rest", () => {
    expect(validDataQualityTiers(["high_potential", "low_potential"])).toEqual([
      "high_potential",
      "low_potential",
    ]);
    expect(validDataQualityTiers(["high_potential", "made_up_tier"])).toEqual(["high_potential"]);
  });
});
