/**
 * Inbox ranking.
 *
 * Scoring answers "how good is this lead". Ranking answers "who should I call
 * next", and those differ mostly because of time: a person with a 95 buyer
 * score last seen three days ago has already had a dozen replies, while an 80
 * scored person seen ten minutes ago is still winnable. Being first is most of
 * the product.
 *
 * Operates on the person-level rollup (`leadType`/`buyerScore`/etc from
 * `domain/scoring/lead-rollup.ts`), not any single appearance — see
 * `application/leads/priority-sql.ts` for the SQL mirror used for `ORDER BY`.
 */

import type { LeadType } from "@/domain/scoring/types";

export interface RankableLead {
  leadType: LeadType | string;
  buyerScore: number;
  sellerScore: number;
  investorScore: number;
  confidenceScore: number;
  latestAppearanceAt: Date | string | null;
  hasContact: boolean;
  status?: string;
}

/** Half-life in hours — a lead's ranking value halves this often. */
export const RECENCY_HALF_LIFE_HOURS = 18;

/**
 * Base-score weights. Exported (not inlined) because `application/leads/priority-sql.ts`
 * builds a SQL mirror of this formula for ORDER BY — sorting/pagination has to happen
 * in the database, and importing these constants there is what keeps the two
 * implementations from drifting apart silently. If you change a weight here, the SQL
 * side picks it up automatically; don't hand-edit the SQL separately.
 */
export const BUYER_SCORE_WEIGHT = 0.7;
export const CONFIDENCE_WEIGHT = 0.3;
/** Supply/investor still ranks, but far below demand, so it can never crowd the inbox. */
export const NON_BUYER_SCORE_WEIGHT = 0.2;

export const CONTACTABLE_BONUS = 1.15;
export const ALREADY_WORKED_PENALTY = 0.5;

export function recencyMultiplier(latestAppearanceAt: Date | string | null, now = Date.now()): number {
  if (latestAppearanceAt === null) return 0.25;
  const at = latestAppearanceAt instanceof Date ? latestAppearanceAt.getTime() : Date.parse(String(latestAppearanceAt));
  if (Number.isNaN(at)) return 0.25;
  const ageHours = Math.max(0, (now - at) / 3_600_000);
  return 2 ** (-ageHours / RECENCY_HALF_LIFE_HOURS);
}

/** Whichever score matches this person's `leadType` — 0 for agent/broker/unknown, no ranking signal for those yet. */
function primaryScore(lead: Pick<RankableLead, "leadType" | "buyerScore" | "sellerScore" | "investorScore">): number {
  if (lead.leadType === "buyer") return lead.buyerScore;
  if (lead.leadType === "seller") return lead.sellerScore;
  if (lead.leadType === "investor") return lead.investorScore;
  return 0;
}

/**
 * Whichever score matches this person's `leadType` — the headline number the
 * UI and digest emails lead with. Falls back to `confidenceScore` for
 * agent/broker/unknown, which have no dedicated 0-100 score of their own yet;
 * `primaryScore` above (ranking-only) deliberately returns 0 in that case
 * instead — a display fallback isn't a ranking signal, showing *some* number
 * is a UI nicety, not evidence this person should rank higher. Pure and
 * framework-free (unlike `application/leads/lead-queries.ts`) specifically so
 * client components can import it directly without pulling in the `"server-only"`
 * Postgres driver that module carries.
 */
export function primaryLeadScore(lead: {
  leadType: string;
  buyerScore: number;
  sellerScore: number;
  investorScore: number;
  confidenceScore: number;
}): number {
  if (lead.leadType === "buyer") return lead.buyerScore;
  if (lead.leadType === "seller") return lead.sellerScore;
  if (lead.leadType === "investor") return lead.investorScore;
  return lead.confidenceScore;
}

/** The base score before recency/contactability/status adjustments — shared with the SQL mirror. */
export function priorityBaseScore(
  lead: Pick<RankableLead, "leadType" | "buyerScore" | "sellerScore" | "investorScore" | "confidenceScore">,
): number {
  if (lead.leadType !== "buyer") return primaryScore(lead) * NON_BUYER_SCORE_WEIGHT;
  return lead.buyerScore * BUYER_SCORE_WEIGHT + lead.confidenceScore * CONFIDENCE_WEIGHT;
}

export function priorityScore(lead: RankableLead, now = Date.now()): number {
  const base = priorityBaseScore(lead);

  if (lead.leadType !== "buyer") {
    return Math.round(base * recencyMultiplier(lead.latestAppearanceAt, now));
  }

  const contactable = lead.hasContact ? CONTACTABLE_BONUS : 1;
  const alreadyWorked =
    lead.status && lead.status !== "new" && lead.status !== "contacted" ? ALREADY_WORKED_PENALTY : 1;

  return Math.round(base * recencyMultiplier(lead.latestAppearanceAt, now) * contactable * alreadyWorked);
}
