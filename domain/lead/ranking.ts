/**
 * Inbox ranking.
 *
 * Scoring answers "how good is this lead". Ranking answers "who should I call
 * next", and those differ mostly because of time: a 95-score buyer post from
 * three days ago has already had a dozen replies, while an 80-score post from
 * ten minutes ago is still winnable. Being first is most of the product.
 */

export interface RankableLead {
  intent: string;
  intentScore: number;
  qualityScore: number;
  postedAt: Date | string;
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
export const BUYER_INTENT_WEIGHT = 0.7;
export const BUYER_QUALITY_WEIGHT = 0.3;
/** Supply still ranks, but far below demand, so it can never crowd the inbox. */
export const NON_BUYER_INTENT_WEIGHT = 0.2;

export const CONTACTABLE_BONUS = 1.15;
export const ALREADY_WORKED_PENALTY = 0.5;

export function recencyMultiplier(postedAt: Date | string, now = Date.now()): number {
  const at = postedAt instanceof Date ? postedAt.getTime() : Date.parse(String(postedAt));
  if (Number.isNaN(at)) return 0.25;
  const ageHours = Math.max(0, (now - at) / 3_600_000);
  return 2 ** (-ageHours / RECENCY_HALF_LIFE_HOURS);
}

/** The base score before recency/contactability/status adjustments — shared with the SQL mirror. */
export function priorityBaseScore(lead: Pick<RankableLead, "intent" | "intentScore" | "qualityScore">): number {
  if (lead.intent !== "buyer") return lead.intentScore * NON_BUYER_INTENT_WEIGHT;
  return lead.intentScore * BUYER_INTENT_WEIGHT + lead.qualityScore * BUYER_QUALITY_WEIGHT;
}

export function priorityScore(lead: RankableLead, now = Date.now()): number {
  const base = priorityBaseScore(lead);

  if (lead.intent !== "buyer") {
    return Math.round(base * recencyMultiplier(lead.postedAt, now));
  }

  const contactable = lead.hasContact ? CONTACTABLE_BONUS : 1;
  const alreadyWorked =
    lead.status && lead.status !== "new" && lead.status !== "contacted"
      ? ALREADY_WORKED_PENALTY
      : 1;

  return Math.round(base * recencyMultiplier(lead.postedAt, now) * contactable * alreadyWorked);
}
