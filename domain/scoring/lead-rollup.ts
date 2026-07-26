/**
 * Person-level AI analysis, rolled up from every appearance a lead has.
 * The `LeadIntelligence` port is the AI seam here — same shape as
 * `LeadClassifier` (domain/scoring/types.ts): a rules engine today, an LLM
 * tomorrow, swappable without touching ingestion or storage. An engagement-only
 * lead (no body text anywhere) is exactly the case a phrase lexicon can't help
 * with and a real LLM given "this profile + these appearances" could.
 */

import type { LeadIntent, LeadRecordKind, LeadType, ScoreReason } from "./types";

/**
 * One appearance's contribution to a person's rollup — a trimmed view of
 * `LeadAppearanceRow`. Deliberately excludes budget: carrying forward "the
 * most recently stated budget" is a plain SQL pick over `lead_appearances`
 * (`application/leads/identity-resolution.ts`), not a scoring decision, so it
 * doesn't need to round-trip through this pure function.
 */
export interface AppearanceForRollup {
  intent: LeadIntent;
  intentScore: number;
  investorScore: number;
  brokerScore: number;
  recordKind: LeadRecordKind;
  propertyTypes: string[];
  locations: string[];
  hasContact: boolean;
  postedAt: Date;
  scoreReasons: ScoreReason[];
}

export interface PersonRollup {
  leadType: LeadType;
  buyerScore: number;
  sellerScore: number;
  investorScore: number;
  confidenceScore: number;
  aiExplanation: string;
  propertyTypes: string[];
  locations: string[];
  latestAppearanceAt: Date | null;
  appearanceCount: number;
}

/** Every score/count field zeroed — the state of a person with no non-spam, non-duplicate appearances. */
export const EMPTY_ROLLUP: PersonRollup = {
  leadType: "unknown",
  buyerScore: 0,
  sellerScore: 0,
  investorScore: 0,
  confidenceScore: 0,
  aiExplanation: "No signal yet — no appearances collected.",
  propertyTypes: [],
  locations: [],
  latestAppearanceAt: null,
  appearanceCount: 0,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Diminishing returns: five corroborating appearances is strong evidence, not five times one appearance's evidence. */
function diminishingSum(values: number[]): number {
  const sorted = [...values].sort((a, b) => b - a);
  return sorted.reduce((total, value, index) => total + value / (1 + index * 0.6), 0);
}

const LEAD_TYPE_FLOOR = 15;

function pickLeadType(candidates: Record<LeadType, number>): LeadType {
  let best: LeadType = "unknown";
  let bestScore = LEAD_TYPE_FLOOR;
  for (const [type, score] of Object.entries(candidates) as [LeadType, number][]) {
    if (type === "unknown") continue;
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

function computeConfidence(
  appearances: AppearanceForRollup[],
  leadType: LeadType,
  primaryScore: number,
): number {
  if (appearances.length === 0) return 0;

  // Baseline for having any data, then diminishing returns per corroborating
  // appearance — a second and third appearance matter far more than a tenth.
  let score = 15 + Math.min(appearances.length - 1, 5) * 10;

  const agreeing = appearances.filter((a) => a.intent === leadType).length;
  if (agreeing >= 2) score += 15;
  if (primaryScore >= 60) score += 15;
  if (appearances.some((a) => a.hasContact)) score += 10;

  return clamp(score);
}

function buildExplanation(
  appearances: AppearanceForRollup[],
  leadType: LeadType,
  scores: { buyerScore: number; sellerScore: number; investorScore: number },
): string {
  if (appearances.length === 0) return EMPTY_ROLLUP.aiExplanation;

  const parts: string[] = [];

  if (leadType === "unknown") {
    parts.push(`No clear buyer/seller/investor signal across ${appearances.length} appearance(s).`);
  } else {
    const relevant = appearances.filter((a) => a.intent === leadType);
    const pool = relevant.length > 0 ? relevant : appearances;
    const strongest = [...pool].sort((a, b) => b.intentScore - a.intentScore)[0];
    const topReason = [...strongest.scoreReasons].filter((r) => r.weight > 0).sort((a, b) => b.weight - a.weight)[0];

    const scoreLabel =
      leadType === "buyer"
        ? scores.buyerScore
        : leadType === "seller"
          ? scores.sellerScore
          : leadType === "investor"
            ? scores.investorScore
            : null;

    parts.push(
      `Classified as ${leadType}${scoreLabel !== null ? ` (score ${scoreLabel})` : ""} from ${pool.length} appearance(s).`,
    );
    if (topReason) {
      parts.push(`Strongest signal: ${topReason.label}${topReason.evidence ? ` ("${topReason.evidence}")` : ""}.`);
    }
  }

  if (appearances.length > 1) {
    const kinds = new Set(appearances.map((a) => a.recordKind));
    parts.push(`Seen ${appearances.length} times across ${kinds.size} source type(s).`);
  }

  return parts.join(" ");
}

/**
 * Deterministic, explainable person-level rollup — the same design posture as
 * `classifyWithRules`: rules first, an LLM later behind `LeadIntelligence`
 * (below) without touching call sites. Pure and side-effect free so it can be
 * unit-tested and re-run at any time (a rollup is exactly as "derived, freely
 * regenerable" as the appearance-level scores it's built from).
 *
 * Input appearances are expected to already be filtered to non-spam,
 * non-duplicate (the caller — `application/leads/identity-resolution.ts` —
 * owns that query scope, same as everywhere else this pattern appears).
 */
export function rollupPersonScores(appearances: AppearanceForRollup[]): PersonRollup {
  if (appearances.length === 0) return EMPTY_ROLLUP;

  const buyerScore = clamp(diminishingSum(appearances.filter((a) => a.intent === "buyer").map((a) => a.intentScore)));
  const sellerScore = clamp(
    diminishingSum(appearances.filter((a) => a.intent === "seller").map((a) => a.intentScore)),
  );
  const agentSignal = clamp(diminishingSum(appearances.filter((a) => a.intent === "agent").map((a) => a.intentScore)));
  const investorScore = clamp(diminishingSum(appearances.map((a) => a.investorScore)));
  const brokerSignal = clamp(diminishingSum(appearances.map((a) => a.brokerScore)));

  const leadType = pickLeadType({
    buyer: buyerScore,
    seller: sellerScore,
    agent: agentSignal,
    broker: brokerSignal,
    investor: investorScore,
    unknown: 0,
  });

  const primaryScore =
    leadType === "buyer"
      ? buyerScore
      : leadType === "seller"
        ? sellerScore
        : leadType === "investor"
          ? investorScore
          : leadType === "agent"
            ? agentSignal
            : leadType === "broker"
              ? brokerSignal
              : 0;

  const propertyTypes = [...new Set(appearances.flatMap((a) => a.propertyTypes))];
  const locations = [...new Set(appearances.flatMap((a) => a.locations))];

  const latestAppearanceAt = appearances.reduce<Date | null>(
    (latest, a) => (latest === null || a.postedAt > latest ? a.postedAt : latest),
    null,
  );

  return {
    leadType,
    buyerScore,
    sellerScore,
    investorScore,
    confidenceScore: computeConfidence(appearances, leadType, primaryScore),
    aiExplanation: buildExplanation(appearances, leadType, { buyerScore, sellerScore, investorScore }),
    propertyTypes,
    locations,
    latestAppearanceAt,
    appearanceCount: appearances.length,
  };
}

export const RULES_ROLLUP_ID = "rules-rollup@1";

export interface LeadIntelligence {
  readonly id: string;
  rollup(appearances: AppearanceForRollup[]): Promise<PersonRollup>;
}

export const rulesRollup: LeadIntelligence = {
  id: RULES_ROLLUP_ID,
  async rollup(appearances) {
    return rollupPersonScores(appearances);
  },
};
