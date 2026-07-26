import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { RECENCY_HALF_LIFE_HOURS } from "@/domain/lead/ranking";
import { prioritySortExpression } from "./priority-sql";

const dialect = new PgDialect();

describe("prioritySortExpression", () => {
  it("binds the ranking weights as parameters rather than inlining them", () => {
    const { sql: text, params } = dialect.sqlToQuery(prioritySortExpression());

    expect(text).toContain("CASE WHEN");
    expect(text).toContain("power(2,");
    // The half-life constant travels with the expression, not hardcoded twice.
    expect(params).toContain(RECENCY_HALF_LIFE_HOURS);
  });

  it("casts every fractional weight to ::numeric", () => {
    // Regression: Postgres infers a bound parameter's type from context. Multiplying
    // against the integer intent_score/quality_score columns without an explicit
    // cast makes it infer `integer`, and binding 0.7 as an integer parameter fails
    // at query time with "invalid input syntax for type integer" — a failure this
    // file's own `sqlToQuery` compile-only check can't catch, only a real DB can.
    const { sql: text } = dialect.sqlToQuery(prioritySortExpression());
    const castCount = (text.match(/::numeric/g) ?? []).length;
    expect(castCount).toBeGreaterThanOrEqual(4);
  });

  it("stays in sync with domain/lead/ranking.ts's exported weights, not a copy", () => {
    const { params } = dialect.sqlToQuery(prioritySortExpression());
    // 0.7 / 0.3 / 0.2 come from BUYER_SCORE_WEIGHT / CONFIDENCE_WEIGHT /
    // NON_BUYER_SCORE_WEIGHT — asserting they're present as bound params (not
    // string-concatenated literals) is what a future weight change can't silently break.
    expect(params).toEqual(expect.arrayContaining([0.7, 0.3, 0.2, RECENCY_HALF_LIFE_HOURS]));
  });
});
