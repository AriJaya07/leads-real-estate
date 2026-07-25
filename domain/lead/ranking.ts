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

export function recencyMultiplier(postedAt: Date | string, now = Date.now()): number {
  const at = postedAt instanceof Date ? postedAt.getTime() : Date.parse(String(postedAt));
  if (Number.isNaN(at)) return 0.25;
  const ageHours = Math.max(0, (now - at) / 3_600_000);
  return 2 ** (-ageHours / RECENCY_HALF_LIFE_HOURS);
}

export function priorityScore(lead: RankableLead, now = Date.now()): number {
  if (lead.intent !== "buyer") {
    // Supply still ranks, but far below demand, so it can never crowd the inbox.
    return Math.round(lead.intentScore * 0.2 * recencyMultiplier(lead.postedAt, now));
  }

  const base = lead.intentScore * 0.7 + lead.qualityScore * 0.3;
  const contactable = lead.hasContact ? 1.15 : 1;
  const alreadyWorked =
    lead.status && lead.status !== "new" && lead.status !== "contacted" ? 0.5 : 1;

  return Math.round(base * recencyMultiplier(lead.postedAt, now) * contactable * alreadyWorked);
}
