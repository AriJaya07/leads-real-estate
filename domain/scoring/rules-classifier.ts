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
  BROKER_PHRASES,
  BUYER_PHRASES,
  INVESTOR_PHRASES,
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
 * Scores an `engagement_like`/`engagement_comment` record — a person's reaction
 * to someone else's post, not a post of their own. There is no body text to
 * phrase-match, so the signal comes from *what they engaged with* instead: the
 * target listing's price/location/property-type, and how many distinct
 * listings this same person engaged with recently (`repeatEngagementCount`,
 * computed by the caller — this function only scores what it's given).
 *
 * This is not the "engagement is not intent" leak the content-post branch
 * guards against — that rule stops a post's *own* like count from inflating
 * its *own* intent score. Here the engagement *is* the record: a person liking
 * a for-sale villa listing is itself the behavioral signal being classified,
 * the same way stated text would be for a content post.
 */
function classifyEngagement(input: ClassifierInput): Classification {
  const reasons: ScoreReason[] = [];
  const ctx = input.engagementContext ?? {};
  const haystack = ctx.targetListingTitle ?? "";

  const propertyTypes = extractPropertyTypes(haystack);
  const locations = extractLocations(haystack, ctx.targetLocationRaw);
  const budget = extractBudget(haystack, ctx.targetPriceRaw);
  const bedrooms = extractBedrooms(haystack);
  const bathrooms = extractBathrooms(haystack);
  const repeatCount = Math.max(0, ctx.repeatEngagementCount ?? 0);

  const action = input.recordKind === "engagement_comment" ? "Commented on" : "Liked";

  let intentScore = 15;
  reasons.push({
    code: "engagement_signal",
    label: `${action} a property listing`,
    weight: 15,
  });

  if (repeatCount > 0) {
    const weight = Math.min(repeatCount * 8, 30);
    intentScore += weight;
    reasons.push({
      code: "repeat_engagement",
      label: `Engaged with ${repeatCount + 1} listings recently`,
      weight,
    });
  }

  if (locations.length > 0) {
    intentScore += 10;
    reasons.push({
      code: "location",
      label: `Engaged with a listing in: ${locations.join(", ")}`,
      weight: 10,
    });
  }
  if (propertyTypes.length > 0) {
    intentScore += 8;
    reasons.push({
      code: "property_type",
      label: `Engaged with a listing type: ${propertyTypes.join(", ")}`,
      weight: 8,
    });
  }
  if (budget) {
    // Informational, not added to their own budget — this is the *listing's*
    // price, not something the person stated about themselves.
    reasons.push({
      code: "target_price",
      label: `Listing price band: ${budget.currency} ${budget.min}–${budget.max}`,
      weight: 0,
    });
  }

  // Quality is low by construction: no contact info, no stated budget, no
  // location/property-type stated by the person themselves — only inferred
  // from what they engaged with. Reflects that this lead needs enrichment
  // (a DM, a profile lookup) before it's workable, unlike a content post that
  // already states contact details directly.
  let qualityScore = 5;
  if (locations.length > 0) qualityScore += 8;
  if (propertyTypes.length > 0) qualityScore += 5;

  return {
    intent: "buyer",
    intentScore: clamp(intentScore),
    qualityScore: clamp(qualityScore),
    // No body text to phrase-match investor/broker framing against — an
    // engagement record's signal is purely behavioral (3.3 in
    // lead-source-scaling-plan.md), so these stay 0 rather than guessing.
    investorScore: 0,
    brokerScore: 0,
    reach: 0,
    isSpam: false,
    propertyTypes,
    locations,
    // Not the person's stated budget — see the `target_price` reason above.
    // Storing it on the structured field would let it flow into budget
    // filtering/sorting as if the person had said it themselves.
    budget: null,
    contact: {},
    bedrooms,
    bathrooms,
    reasons: reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    classifierId: RULES_CLASSIFIER_ID,
    classifiedAt: new Date().toISOString(),
  };
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
  if (input.recordKind === "engagement_like" || input.recordKind === "engagement_comment") {
    return classifyEngagement(input);
  }

  const haystack = [input.body, input.listingTitle ?? ""].join("\n").trim();
  const reasons: ScoreReason[] = [];

  const spamHits = matchPhrases(haystack, SPAM_PHRASES);
  const recruitmentHits = matchPhrases(haystack, RECRUITMENT_PHRASES);
  const buyerHits = matchPhrases(haystack, BUYER_PHRASES);
  const sellerHits = matchPhrases(haystack, SELLER_PHRASES);
  const agentHits = matchPhrases(haystack, AGENT_PHRASES);
  const investorHits = matchPhrases(haystack, INVESTOR_PHRASES);
  const brokerHits = matchPhrases(haystack, BROKER_PHRASES);
  // Additive signals, computed regardless of the primary intent pick — see the
  // `investorScore`/`brokerScore` doc comment on `Classification`. Zeroed out
  // below if this record turns out to be spam.
  const investorScore = clamp(sumWeights(investorHits));
  const brokerScore = clamp(sumWeights(brokerHits));

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
      investorScore: 0,
      brokerScore: 0,
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

  if (investorScore > 0) {
    reasons.push({
      code: "investor_framing",
      label: "Investment-framed language",
      weight: investorScore,
      evidence: investorHits.map((h) => h.phrase.text).join(", "),
    });
  }
  if (brokerScore > 0) {
    reasons.push({
      code: "broker_framing",
      label: "Licensed-broker/brokerage language",
      weight: brokerScore,
      evidence: brokerHits.map((h) => h.phrase.text).join(", "),
    });
  }

  return {
    intent,
    intentScore: clamp(intentScore),
    qualityScore: clamp(qualityScore),
    investorScore,
    brokerScore,
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
