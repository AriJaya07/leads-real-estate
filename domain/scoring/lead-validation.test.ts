import { describe, expect, it } from "vitest";
import {
  BUSINESS_POTENTIAL_WEIGHT,
  COMPLETENESS_WEIGHT,
  CONTACT_INFO_WEIGHT,
  ENGAGEMENT_WEIGHT,
  HIGH_POTENTIAL_THRESHOLD,
  INDUSTRY_WEIGHT,
  LOCATION_WEIGHT,
  MEDIUM_POTENTIAL_THRESHOLD,
  RELEVANCE_WEIGHT,
  scoreAndValidateLead,
  type LeadValidationInput,
} from "./lead-validation";

const NOW = new Date("2026-07-30T00:00:00.000Z");

function baseInput(overrides: Partial<LeadValidationInput> = {}): LeadValidationInput {
  return {
    name: null,
    avatarUrl: null,
    bio: null,
    username: null,
    profileUrl: null,
    location: null,
    propertyTypes: [],
    budgetUsdMin: null,
    budgetUsdMax: null,
    leadType: "unknown",
    contact: {},
    buyerScore: 0,
    sellerScore: 0,
    investorScore: 0,
    confidenceScore: 0,
    affiliatedIndustries: [],
    locations: [],
    appearanceCount: 0,
    latestAppearanceAt: null,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    now: NOW,
    ...overrides,
  };
}

describe("scoreAndValidateLead — weights", () => {
  it("sums to 1 so the composite score never drifts outside 0-100 by construction", () => {
    const total =
      COMPLETENESS_WEIGHT +
      CONTACT_INFO_WEIGHT +
      RELEVANCE_WEIGHT +
      INDUSTRY_WEIGHT +
      LOCATION_WEIGHT +
      ENGAGEMENT_WEIGHT +
      BUSINESS_POTENTIAL_WEIGHT;
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("scoreAndValidateLead — tiers", () => {
  it("rates a complete, relevant, engaged, budgeted buyer as high potential", () => {
    const result = scoreAndValidateLead(
      baseInput({
        name: "Made Wirawan",
        avatarUrl: "https://example.com/avatar.jpg",
        bio: "Looking for a villa in Canggu",
        username: "madew",
        profileUrl: "https://instagram.com/madew",
        location: "Canggu, Bali",
        propertyTypes: ["villa"],
        budgetUsdMin: 200_000,
        budgetUsdMax: 300_000,
        leadType: "buyer",
        contact: { phone: "+6281234567890", whatsapp: "+6281234567890" },
        buyerScore: 90,
        confidenceScore: 85,
        locations: ["canggu"],
        appearanceCount: 4,
        latestAppearanceAt: new Date("2026-07-28T00:00:00.000Z"),
        totalLikes: 40,
        totalComments: 10,
        totalShares: 2,
      }),
    );

    expect(result.leadScore).toBeGreaterThanOrEqual(HIGH_POTENTIAL_THRESHOLD);
    expect(result.validationResult).toBe("high_potential");
    expect(result.reasons[0]).toMatch(/High potential/);
    expect(result.reasons.length).toBeGreaterThan(1);
  });

  it("rates a partially-filled, moderately relevant lead as medium potential", () => {
    const result = scoreAndValidateLead(
      baseInput({
        name: "Someone",
        location: "Bali",
        leadType: "buyer",
        contact: { email: "someone@example.com" },
        buyerScore: 50,
        confidenceScore: 40,
        locations: ["bali"],
        appearanceCount: 1,
        latestAppearanceAt: new Date("2026-07-01T00:00:00.000Z"),
      }),
    );

    expect(result.validationResult).toBe("medium_potential");
    expect(result.reasons[0]).toMatch(/Medium potential/);
  });

  it("rates an empty, unreachable, irrelevant record as low potential", () => {
    const result = scoreAndValidateLead(baseInput());

    expect(result.leadScore).toBeLessThan(MEDIUM_POTENTIAL_THRESHOLD);
    expect(result.validationResult).toBe("low_potential");
    expect(result.reasons[0]).toMatch(/Low potential/);
  });
});

describe("scoreAndValidateLead — data completeness", () => {
  it("scores 100 completeness only when every tracked field is present", () => {
    const complete = scoreAndValidateLead(
      baseInput({
        name: "A",
        avatarUrl: "a",
        bio: "a",
        username: "a",
        location: "a",
        propertyTypes: ["villa"],
        budgetUsdMin: 1000,
        leadType: "buyer",
      }),
    );
    expect(complete.breakdown.completeness).toBe(100);

    const empty = scoreAndValidateLead(baseInput());
    expect(empty.breakdown.completeness).toBe(0);
  });
});

describe("scoreAndValidateLead — contact information", () => {
  it("ranks more contact channels strictly higher", () => {
    const none = scoreAndValidateLead(baseInput()).breakdown.contactInfo;
    const profileOnly = scoreAndValidateLead(baseInput({ profileUrl: "https://x.com/a" })).breakdown.contactInfo;
    const one = scoreAndValidateLead(baseInput({ contact: { email: "a@b.com" } })).breakdown.contactInfo;
    const two = scoreAndValidateLead(
      baseInput({ contact: { email: "a@b.com", phone: "+6281234567890" } }),
    ).breakdown.contactInfo;
    const three = scoreAndValidateLead(
      baseInput({ contact: { email: "a@b.com", phone: "+6281234567890", whatsapp: "+6281234567890" } }),
    ).breakdown.contactInfo;

    expect(none).toBeLessThan(profileOnly);
    expect(profileOnly).toBeLessThan(one);
    expect(one).toBeLessThan(two);
    expect(two).toBeLessThan(three);
    expect(three).toBe(100);
  });
});

describe("scoreAndValidateLead — customer relevance", () => {
  it("ranks a buyer above an investor above a seller above unknown, at equal confidence", () => {
    const score = (leadType: string) =>
      scoreAndValidateLead(baseInput({ leadType, confidenceScore: 50 })).breakdown.relevance;

    expect(score("buyer")).toBeGreaterThan(score("investor"));
    expect(score("investor")).toBeGreaterThan(score("seller"));
    expect(score("seller")).toBeGreaterThan(score("unknown"));
  });

  it("tempers relevance by confidence — same lead type, lower confidence scores lower", () => {
    const high = scoreAndValidateLead(baseInput({ leadType: "buyer", confidenceScore: 90 })).breakdown.relevance;
    const low = scoreAndValidateLead(baseInput({ leadType: "buyer", confidenceScore: 10 })).breakdown.relevance;
    expect(high).toBeGreaterThan(low);
  });
});

describe("scoreAndValidateLead — industry", () => {
  it("treats no affiliation as neutral, not a penalty", () => {
    expect(scoreAndValidateLead(baseInput({ affiliatedIndustries: [] })).breakdown.industry).toBe(50);
  });

  it("scores an on-market industry affiliation higher than an unrelated one", () => {
    const related = scoreAndValidateLead(
      baseInput({ affiliatedIndustries: ["Real Estate Development"] }),
    ).breakdown.industry;
    const unrelated = scoreAndValidateLead(baseInput({ affiliatedIndustries: ["Textiles"] })).breakdown.industry;
    expect(related).toBeGreaterThan(unrelated);
    expect(unrelated).toBeGreaterThan(0);
  });
});

describe("scoreAndValidateLead — location", () => {
  it("scores a known Bali location highest, an out-of-market location lower, unknown lowest", () => {
    const inMarket = scoreAndValidateLead(baseInput({ locations: ["canggu"] })).breakdown.location;
    const outOfMarket = scoreAndValidateLead(baseInput({ location: "Jakarta" })).breakdown.location;
    const unknown = scoreAndValidateLead(baseInput()).breakdown.location;

    expect(inMarket).toBe(100);
    expect(outOfMarket).toBeLessThan(inMarket);
    expect(unknown).toBeLessThan(outOfMarket);
  });
});

describe("scoreAndValidateLead — engagement", () => {
  it("rewards more appearances, recent activity and social proof", () => {
    const cold = scoreAndValidateLead(baseInput()).breakdown.engagement;
    const oneOld = scoreAndValidateLead(
      baseInput({ appearanceCount: 1, latestAppearanceAt: new Date("2020-01-01T00:00:00.000Z") }),
    ).breakdown.engagement;
    const activeAndSocial = scoreAndValidateLead(
      baseInput({
        appearanceCount: 4,
        latestAppearanceAt: new Date("2026-07-29T00:00:00.000Z"),
        totalLikes: 100,
        totalComments: 20,
        totalShares: 5,
      }),
    ).breakdown.engagement;

    expect(cold).toBe(0);
    expect(oneOld).toBeGreaterThan(cold);
    expect(activeAndSocial).toBeGreaterThan(oneOld);
  });
});

describe("scoreAndValidateLead — business potential", () => {
  it("rewards a stated budget, more so above the meaningful-budget threshold", () => {
    const noBudget = scoreAndValidateLead(baseInput({ leadType: "buyer", buyerScore: 50 })).breakdown
      .businessPotential;
    const smallBudget = scoreAndValidateLead(
      baseInput({ leadType: "buyer", buyerScore: 50, budgetUsdMin: 10_000 }),
    ).breakdown.businessPotential;
    const bigBudget = scoreAndValidateLead(
      baseInput({ leadType: "buyer", buyerScore: 50, budgetUsdMin: 200_000 }),
    ).breakdown.businessPotential;

    expect(smallBudget).toBeGreaterThan(noBudget);
    expect(bigBudget).toBeGreaterThan(smallBudget);
  });

  it("discounts seller potential relative to an equally-scored buyer", () => {
    const buyer = scoreAndValidateLead(baseInput({ leadType: "buyer", buyerScore: 80 })).breakdown.businessPotential;
    const seller = scoreAndValidateLead(baseInput({ leadType: "seller", sellerScore: 80 })).breakdown
      .businessPotential;
    expect(seller).toBeLessThan(buyer);
  });
});
