/**
 * Customer data validation and lead scoring.
 *
 * Distinct from `lead-rollup.ts`: the rollup answers "what does this person's
 * *text* say" (buyer/seller/investor intent, from phrase matching). This
 * answers a different question — "how much should we trust and prioritize
 * this *record*" — by grading the data itself across seven dimensions (data
 * completeness, contact information, customer relevance, industry, location,
 * engagement, business potential) into an explainable score, a High/Medium/Low
 * potential tier, and the reasons behind both. Pure and side-effect free, same
 * posture as `rollupPersonScores`: fully derived from whatever the caller
 * already knows about a lead, freely re-runnable, unit-testable with no mocks.
 */

import type { ContactInfo, LeadType } from "./types";
import { BALI_LOCATIONS } from "./lexicon";
import { canonicalLocation } from "./extractors";

export interface LeadValidationInput {
  // --- Data completeness ---
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  username: string | null;
  profileUrl: string | null;
  location: string | null;
  propertyTypes: string[];
  budgetUsdMin: number | null;
  budgetUsdMax: number | null;
  leadType: LeadType | string;

  // --- Contact information ---
  contact: ContactInfo;

  // --- Customer relevance ---
  buyerScore: number;
  sellerScore: number;
  investorScore: number;
  confidenceScore: number;

  // --- Industry --- (B2B signal, optional — most leads are individuals, not firms)
  affiliatedIndustries: string[];

  // --- Location --- (already-resolved canonical tags from every appearance)
  locations: string[];

  // --- Engagement ---
  appearanceCount: number;
  latestAppearanceAt: Date | string | null;
  totalLikes: number;
  totalComments: number;
  totalShares: number;

  now?: Date;
}

export interface LeadValidationBreakdown {
  completeness: number;
  contactInfo: number;
  relevance: number;
  industry: number;
  location: number;
  engagement: number;
  businessPotential: number;
}

export type LeadPotential = "high_potential" | "medium_potential" | "low_potential";

export interface LeadValidationResult {
  /** 0-100 composite, weighted across every dimension below. */
  leadScore: number;
  validationResult: LeadPotential;
  /** Ordered, most impactful first — the "why" behind the score, never a naked number. */
  reasons: string[];
  breakdown: LeadValidationBreakdown;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Weights — sum to 1. Exported so a UI can render them (e.g. "business
// potential counts for 25% of the score") without hand-copying magic numbers.
// ---------------------------------------------------------------------------

export const COMPLETENESS_WEIGHT = 0.15;
export const CONTACT_INFO_WEIGHT = 0.15;
export const RELEVANCE_WEIGHT = 0.2;
export const INDUSTRY_WEIGHT = 0.05;
export const LOCATION_WEIGHT = 0.1;
export const ENGAGEMENT_WEIGHT = 0.1;
export const BUSINESS_POTENTIAL_WEIGHT = 0.25;

export const HIGH_POTENTIAL_THRESHOLD = 70;
export const MEDIUM_POTENTIAL_THRESHOLD = 40;

/** A stated budget at or above this (USD) is a concrete, actionable buying signal for Bali property. */
export const BUSINESS_POTENTIAL_BUDGET_BONUS_USD = 150_000;

// ---------------------------------------------------------------------------
// Data completeness
// ---------------------------------------------------------------------------

function scoreCompleteness(input: LeadValidationInput): number {
  const fields = [
    Boolean(input.name),
    Boolean(input.avatarUrl),
    Boolean(input.bio),
    Boolean(input.username || input.profileUrl),
    Boolean(input.location),
    input.propertyTypes.length > 0,
    input.budgetUsdMin !== null || input.budgetUsdMax !== null,
    input.leadType !== "unknown",
  ];
  const filled = fields.filter(Boolean).length;
  return clamp((filled / fields.length) * 100);
}

// ---------------------------------------------------------------------------
// Contact information
// ---------------------------------------------------------------------------

function scoreContactInfo(contact: ContactInfo, profileUrl: string | null): number {
  const channels = [contact.phone, contact.email, contact.whatsapp].filter(Boolean).length;
  if (channels === 0) return profileUrl ? 20 : 0; // a public profile is weak but real contactability
  if (channels === 1) return 60;
  if (channels === 2) return 85;
  return 100;
}

// ---------------------------------------------------------------------------
// Customer relevance
// ---------------------------------------------------------------------------

/** How relevant each rolled-up lead type is to a sales-led real-estate business — demand outranks supply. */
const RELEVANCE_BASE_BY_LEAD_TYPE: Record<string, number> = {
  buyer: 95,
  investor: 85,
  seller: 55,
  broker: 45,
  agent: 35,
  unknown: 10,
};

function scoreRelevance(leadType: string, confidenceScore: number): number {
  const base = RELEVANCE_BASE_BY_LEAD_TYPE[leadType] ?? RELEVANCE_BASE_BY_LEAD_TYPE.unknown;
  // Confidence tempers the base: a "buyer" classification the rollup itself isn't sure about
  // shouldn't score as relevant as one backed by several corroborating appearances.
  return clamp(base * 0.65 + confidenceScore * 0.35);
}

// ---------------------------------------------------------------------------
// Industry
// ---------------------------------------------------------------------------

const RELATED_INDUSTRY_TERMS = [
  "real estate",
  "property",
  "realty",
  "construction",
  "hospitality",
  "investment",
  "finance",
  "architecture",
];

/**
 * Most leads are individuals with no firm affiliation at all — that's not a
 * data gap to penalize (see `docs/domain.md`: this product is person-centric
 * by design), so "no affiliation" scores neutral rather than low. Only an
 * affiliation that's actually present moves this score, up when the firm's
 * industry overlaps the business's own market, down slightly when it doesn't.
 */
function scoreIndustry(affiliatedIndustries: string[]): number {
  if (affiliatedIndustries.length === 0) return 50;
  const related = affiliatedIndustries.some((industry) =>
    RELATED_INDUSTRY_TERMS.some((term) => industry.toLowerCase().includes(term)),
  );
  return related ? 90 : 55;
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

const TARGET_MARKET_LOCATIONS = new Set([...BALI_LOCATIONS, "bali"]);

function scoreLocation(location: string | null, locations: string[]): number {
  const candidates = [...locations, ...(location ? [canonicalLocation(location)] : [])].map((l) =>
    l.toLowerCase(),
  );
  if (candidates.length === 0) return 20; // unknown — can't confirm in-market, but not disqualifying
  const inTargetMarket = candidates.some((c) => TARGET_MARKET_LOCATIONS.has(c));
  return inTargetMarket ? 100 : 40;
}

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

function recencyBonus(latestAppearanceAt: Date | string | null, now: Date): number {
  if (!latestAppearanceAt) return 0;
  const at =
    latestAppearanceAt instanceof Date ? latestAppearanceAt.getTime() : Date.parse(String(latestAppearanceAt));
  if (Number.isNaN(at)) return 0;
  const ageDays = Math.max(0, (now.getTime() - at) / 86_400_000);
  if (ageDays <= 7) return 40;
  if (ageDays <= 30) return 25;
  if (ageDays <= 90) return 10;
  return 0;
}

function scoreEngagement(input: LeadValidationInput): number {
  // Diminishing per-appearance credit, same reasoning as the rollup's diminishingSum:
  // a second and third appearance matter far more than a tenth.
  const appearanceBase = Math.min(input.appearanceCount, 4) * 15;
  const social = Math.min(
    Math.round((input.totalLikes + input.totalComments * 2 + input.totalShares * 3) / 10),
    20,
  );
  return clamp(appearanceBase + recencyBonus(input.latestAppearanceAt, input.now ?? new Date()) + social);
}

// ---------------------------------------------------------------------------
// Business potential
// ---------------------------------------------------------------------------

function scoreBusinessPotential(input: LeadValidationInput): number {
  const primary =
    input.leadType === "buyer"
      ? input.buyerScore
      : input.leadType === "investor"
        ? input.investorScore
        : input.leadType === "seller"
          ? input.sellerScore * 0.6
          : input.confidenceScore * 0.3;

  let score = primary;
  const hasBudget = input.budgetUsdMin !== null || input.budgetUsdMax !== null;
  if (hasBudget) score += 15;
  if ((input.budgetUsdMax ?? input.budgetUsdMin ?? 0) >= BUSINESS_POTENTIAL_BUDGET_BONUS_USD) score += 10;

  return clamp(score);
}

// ---------------------------------------------------------------------------
// Composite + explanation
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<keyof LeadValidationBreakdown, string> = {
  completeness: "profile completeness",
  contactInfo: "contact information",
  relevance: "customer relevance",
  industry: "industry fit",
  location: "location match",
  engagement: "engagement",
  businessPotential: "business potential",
};

const WEIGHTS: Record<keyof LeadValidationBreakdown, number> = {
  completeness: COMPLETENESS_WEIGHT,
  contactInfo: CONTACT_INFO_WEIGHT,
  relevance: RELEVANCE_WEIGHT,
  industry: INDUSTRY_WEIGHT,
  location: LOCATION_WEIGHT,
  engagement: ENGAGEMENT_WEIGHT,
  businessPotential: BUSINESS_POTENTIAL_WEIGHT,
};

const TIER_HEADLINE: Record<LeadPotential, string> = {
  high_potential: "High potential — complete information, strong buying signals and a relevant customer profile.",
  medium_potential: "Medium potential — some useful information present, but this lead needs more validation.",
  low_potential: "Low potential — weak information and low relevance to the target customer profile.",
};

function buildReasons(breakdown: LeadValidationBreakdown, tier: LeadPotential): string[] {
  const keys = Object.keys(breakdown) as (keyof LeadValidationBreakdown)[];
  const strongest = [...keys].sort((a, b) => breakdown[b] - breakdown[a]).filter((k) => breakdown[k] >= 60);
  const weakest = [...keys].sort((a, b) => breakdown[a] - breakdown[b]).filter((k) => breakdown[k] < 50);

  const reasons = [TIER_HEADLINE[tier]];

  for (const key of strongest.slice(0, 2)) {
    reasons.push(`Strong ${DIMENSION_LABELS[key]} (${breakdown[key]}/100).`);
  }
  for (const key of weakest.slice(0, 2)) {
    // Don't repeat a dimension that already made the "strongest" cut (possible at the tier
    // boundary when only one or two dimensions are scored at all).
    if (strongest.includes(key)) continue;
    reasons.push(`Weak ${DIMENSION_LABELS[key]} (${breakdown[key]}/100) — needs validation.`);
  }

  return reasons;
}

/**
 * Scores and validates one lead's data across all seven dimensions, producing
 * the score, the High/Medium/Low potential tier, and the reasons behind both.
 */
export function scoreAndValidateLead(input: LeadValidationInput): LeadValidationResult {
  const breakdown: LeadValidationBreakdown = {
    completeness: scoreCompleteness(input),
    contactInfo: scoreContactInfo(input.contact, input.profileUrl),
    relevance: scoreRelevance(String(input.leadType), input.confidenceScore),
    industry: scoreIndustry(input.affiliatedIndustries),
    location: scoreLocation(input.location, input.locations),
    engagement: scoreEngagement(input),
    businessPotential: scoreBusinessPotential(input),
  };

  const leadScore = clamp(
    (Object.keys(breakdown) as (keyof LeadValidationBreakdown)[]).reduce(
      (total, key) => total + breakdown[key] * WEIGHTS[key],
      0,
    ),
  );

  const validationResult: LeadPotential =
    leadScore >= HIGH_POTENTIAL_THRESHOLD
      ? "high_potential"
      : leadScore >= MEDIUM_POTENTIAL_THRESHOLD
        ? "medium_potential"
        : "low_potential";

  return { leadScore, validationResult, breakdown, reasons: buildReasons(breakdown, validationResult) };
}
