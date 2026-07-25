import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { schema } from "@/infrastructure/db/client";
import {
  BUYER_INTENT_WEIGHT,
  BUYER_QUALITY_WEIGHT,
  NON_BUYER_INTENT_WEIGHT,
  RECENCY_HALF_LIFE_HOURS,
} from "@/domain/lead/ranking";

/**
 * SQL mirror of `domain/lead/ranking.ts::priorityBaseScore` + `recencyMultiplier`,
 * built from the same exported constants so the two can't drift apart silently
 * (see the comment on those constants). Sorting/pagination has to happen in the
 * database, which is why `priorityScore` itself can't be called directly here.
 *
 * Deliberately omits the `hasContact`/`alreadyWorked` multipliers `priorityScore`
 * applies for display — those are a secondary tie-break today, not the primary sort
 * key. If that gap ever needs closing, extend both this and the TS constants together.
 */
export function prioritySortExpression(): SQL {
  // Every weight is cast to ::numeric explicitly. Without it, Postgres infers the
  // bound parameter's type from context — multiplying against the integer
  // `intent_score`/`quality_score` columns makes it infer `integer`, and binding
  // 0.7 as an integer parameter fails outright ("invalid input syntax for type
  // integer"). Caught by the e2e suite hitting a real database; the unit test for
  // this file only asserted on parameter *values*, not actual execution.
  return sql`
    (CASE WHEN ${schema.leads.intent} = 'buyer'
          THEN (${schema.leads.intentScore} * ${BUYER_INTENT_WEIGHT}::numeric + ${schema.leads.qualityScore} * ${BUYER_QUALITY_WEIGHT}::numeric)
          ELSE ${schema.leads.intentScore} * ${NON_BUYER_INTENT_WEIGHT}::numeric END)
    * power(2, -GREATEST(0, EXTRACT(EPOCH FROM (now() - ${schema.leads.postedAt})) / 3600.0) / ${RECENCY_HALF_LIFE_HOURS}::numeric)
  `;
}
