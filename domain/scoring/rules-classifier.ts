import {
  extractBathrooms,
  extractBedrooms,
  extractBudget,
  extractContact,
  extractLocations,
  extractPropertyTypes,
  matchPhrases,
} from "./extractors";
import {
  AGENT_PHRASES,
  BUYER_PHRASES,
  RECRUITMENT_PHRASES,
  SELLER_PHRASES,
  SPAM_PHRASES,
} from "./lexicon";
import type {
  Classification,
  ClassifierInput,
  LeadClassifier,
  LeadIntent,
  ScoreReason,
} from "./types";

export const RULES_CLASSIFIER_ID = "rules@2";

/** Structured listing shape ("3 beds · 3 bath · Villa" + a price) means inventory. */
function looksLikeListing(input: ClassifierInput): boolean {
  const hasStructuredTitle = Boolean(input.listingTitle && /\d+\s*(bed|bath)/i.test(input.listingTitle));
  return hasStructuredTitle && Boolean(input.priceRaw);
}

function sumWeights(hits: { phrase: { weight: number } }[]): number {
  // Diminishing returns: ten synonyms for "for sale" is not ten times the signal.
  const sorted = hits.map((h) => h.phrase.weight).sort((a, b) => b - a);
  return sorted.reduce((total, weight, index) => total + weight / (1 + index * 0.6), 0);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Deterministic, explainable intent classification.
 *
 * Two decisions worth stating explicitly:
 *  - Engagement is *not* part of the intent score. Likes measure post popularity,
 *    not intent to transact; mixing them lets a popular listing outrank a real
 *    buyer. It is reported separately as `reach`.
 *  - Intent and quality are separate axes. "I want to buy a villa" is high intent
 *    and low quality (no budget, no contact, no location). Agents need both.
 */
export function classifyWithRules(input: ClassifierInput): Classification {
  const haystack = [input.body, input.listingTitle ?? ""].join("\n").trim();
  const reasons: ScoreReason[] = [];

  const spamHits = matchPhrases(haystack, SPAM_PHRASES);
  const recruitmentHits = matchPhrases(haystack, RECRUITMENT_PHRASES);
  const buyerHits = matchPhrases(haystack, BUYER_PHRASES);
  const sellerHits = matchPhrases(haystack, SELLER_PHRASES);
  const agentHits = matchPhrases(haystack, AGENT_PHRASES);

  const propertyTypes = extractPropertyTypes(haystack);
  const locations = extractLocations(haystack, input.locationRaw);
  const budget = extractBudget(haystack, input.priceRaw);
  const contact = extractContact(haystack);
  const bedrooms = input.bedrooms ?? extractBedrooms(input.listingTitle ?? haystack);
  const bathrooms = input.bathrooms ?? extractBathrooms(input.listingTitle ?? haystack);

  const engagement = input.engagement ?? { likes: 0, comments: 0, shares: 0 };
  const reach = clamp(engagement.likes + engagement.comments * 2 + engagement.shares * 3, 0, 1000);

  // --- Irrelevance gate ----------------------------------------------------
  // Recruitment overrides buy-intent phrases outright: "we're looking for a
  // Property Operations Executive" trips every buyer phrase while being the
  // opposite of demand.
  const recruitmentScore = sumWeights(recruitmentHits);
  const isRecruitment = recruitmentScore >= 40;
  const spamScore = sumWeights(spamHits);
  const isSpam = isRecruitment || (spamScore >= 35 && buyerHits.length === 0);

  if (isSpam) {
    reasons.push(
      isRecruitment
        ? {
            code: "recruitment",
            label: "Job posting, not a property enquiry",
            weight: -100,
            evidence: recruitmentHits.map((h) => h.phrase.text).join(", "),
          }
        : {
            code: "spam",
            label: "Off-topic commercial post",
            weight: -100,
            evidence: spamHits.map((h) => h.phrase.text).join(", "),
          },
    );
    return {
      intent: "other",
      intentScore: 0,
      qualityScore: 0,
      reach,
      isSpam: true,
      propertyTypes,
      locations,
      budget,
      contact,
      bedrooms,
      bathrooms,
      reasons,
      classifierId: RULES_CLASSIFIER_ID,
      classifiedAt: new Date().toISOString(),
    };
  }

  // --- Intent --------------------------------------------------------------
  const buyerWeight = sumWeights(buyerHits);
  const sellerWeight = sumWeights(sellerHits) + (looksLikeListing(input) ? 25 : 0);
  const agentWeight = sumWeights(agentHits);

  let intent: LeadIntent = "other";
  const strongest = Math.max(buyerWeight, sellerWeight, agentWeight);
  if (strongest > 0) {
    if (agentWeight === strongest) intent = "agent";
    else if (sellerWeight === strongest) intent = "seller";
    else intent = "buyer";
  }

  let intentScore = 0;

  if (intent === "buyer") {
    intentScore += Math.min(buyerWeight, 55);
    for (const hit of buyerHits.slice(0, 3)) {
      reasons.push({
        code: "buyer_phrase",
        label: `Buy-intent phrase "${hit.phrase.text}"`,
        weight: hit.phrase.weight,
        evidence: hit.phrase.text,
      });
    }

    // Supply-side language inside a buyer post is contradictory — an agent
    // prospecting under a "looking for" framing, usually.
    if (sellerWeight > 0 || agentWeight > 0) {
      const penalty = Math.min((sellerWeight + agentWeight) * 0.6, 30);
      intentScore -= penalty;
      reasons.push({
        code: "mixed_signals",
        label: "Also contains listing/agency language",
        weight: -Math.round(penalty),
      });
    }

    if (locations.length > 0) {
      intentScore += 12;
      reasons.push({
        code: "location",
        label: `Named location: ${locations.join(", ")}`,
        weight: 12,
      });
    }
    if (propertyTypes.length > 0) {
      intentScore += 10;
      reasons.push({
        code: "property_type",
        label: `Property type: ${propertyTypes.join(", ")}`,
        weight: 10,
      });
    }
    if (budget) {
      intentScore += 18;
      reasons.push({
        code: "budget",
        label: `Budget stated (${budget.currency})`,
        weight: 18,
        evidence: `${budget.min} – ${budget.max}`,
      });
    }
  } else if (intent === "seller" || intent === "agent") {
    // Supply is tracked and scored, but it is not the demand the sales team is
    // paid to find. Capped so it can never outrank a buyer in the inbox.
    intentScore = Math.min(strongest, 45);
    reasons.push({
      code: intent === "agent" ? "agent_listing" : "seller_listing",
      label: intent === "agent" ? "Agency/professional listing" : "Property listing (supply side)",
      weight: Math.round(intentScore),
    });
    if (looksLikeListing(input)) {
      reasons.push({
        code: "structured_listing",
        label: "Structured listing fields present (beds/baths + price)",
        weight: 25,
      });
    }
  }

  // --- Quality: how workable is this lead, independent of intent -----------
  let qualityScore = 0;
  if (contact.whatsapp) {
    qualityScore += 30;
    reasons.push({ code: "contact_whatsapp", label: "WhatsApp number published", weight: 30 });
  } else if (contact.phone) {
    qualityScore += 22;
    reasons.push({ code: "contact_phone", label: "Phone number published", weight: 22 });
  }
  if (contact.email) {
    qualityScore += 12;
    reasons.push({ code: "contact_email", label: "Email published", weight: 12 });
  }
  if (budget) qualityScore += 20;
  if (locations.length > 0) qualityScore += 15;
  if (propertyTypes.length > 0) qualityScore += 10;
  if (haystack.length > 140) qualityScore += 8;
  if (bedrooms !== null) qualityScore += 5;

  return {
    intent,
    intentScore: clamp(intentScore),
    qualityScore: clamp(qualityScore),
    reach,
    isSpam: false,
    propertyTypes,
    locations,
    budget,
    contact,
    bedrooms,
    bathrooms,
    reasons: reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    classifierId: RULES_CLASSIFIER_ID,
    classifiedAt: new Date().toISOString(),
  };
}

export const rulesClassifier: LeadClassifier = {
  id: RULES_CLASSIFIER_ID,
  async classify(input) {
    return classifyWithRules(input);
  },
};
