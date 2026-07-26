import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { schema } from "@/infrastructure/db/client";
import { BUYER_SCORE_WEIGHT, CONFIDENCE_WEIGHT, NON_BUYER_SCORE_WEIGHT, RECENCY_HALF_LIFE_HOURS } from "@/domain/lead/ranking";

/**
 * SQL mirror of `domain/lead/ranking.ts::priorityBaseScore` + `recencyMultiplier`,
 * built from the same exported constants so the two can't drift apart silently
 * (see the comment on those constants). Sorting/pagination has to happen in the
 * database, which is why `priorityScore` itself can't be called directly here.
 *
 * Deliberately omits the `hasContact`/`alreadyWorked` display-only multipliers
 * `priorityScore` applies — those are a secondary tie-break today, not the
 * primary sort key. If that gap ever needs closing, extend both this and the
 * TS constants together.
 */
export function prioritySortExpression(): SQL {
  // Every weight is cast to ::numeric explicitly. Without it, Postgres infers the
  // bound parameter's type from context — multiplying against the integer
  // `buyer_score`/`confidence_score` columns made it infer `integer`, and binding
  // 0.7 as an integer parameter fails outright ("invalid input syntax for type
  // integer"). Caught by the e2e suite hitting a real database; the unit test for
  // this file only asserted on parameter *values*, not actual execution.
  //
  // `latest_appearance_at` is nullable (a lead with zero non-spam appearances) —
  // coalesced to the epoch so a NULL sorts as maximally old (age underflows
  // `power(2, ...)` to ~0) instead of NULL propagating and landing first under
  // `ORDER BY ... DESC`'s default NULLS FIRST.
  return sql`
    (CASE WHEN ${schema.leads.leadType} = 'buyer'
          THEN (${schema.leads.buyerScore} * ${BUYER_SCORE_WEIGHT}::numeric + ${schema.leads.confidenceScore} * ${CONFIDENCE_WEIGHT}::numeric)
          WHEN ${schema.leads.leadType} = 'seller'
          THEN ${schema.leads.sellerScore} * ${NON_BUYER_SCORE_WEIGHT}::numeric
          WHEN ${schema.leads.leadType} = 'investor'
          THEN ${schema.leads.investorScore} * ${NON_BUYER_SCORE_WEIGHT}::numeric
          ELSE 0 END)
    * power(2, -GREATEST(0, EXTRACT(EPOCH FROM (now() - coalesce(${schema.leads.latestAppearanceAt}, to_timestamp(0)))) / 3600.0) / ${RECENCY_HALF_LIFE_HOURS}::numeric)
  `;
}
