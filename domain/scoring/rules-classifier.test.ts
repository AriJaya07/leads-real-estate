import { describe, expect, it } from "vitest";
import { classifyWithRules } from "./rules-classifier";

const base = { engagement: { likes: 0, comments: 0, shares: 0 } };

describe("classifyWithRules — intent", () => {
  it("scores an explicit buyer highly and explains why", () => {
    const result = classifyWithRules({
      ...base,
      body: "Looking to buy a villa in Canggu, my budget is USD 350k. WhatsApp +6281234567890",
    });

    expect(result.intent).toBe("buyer");
    expect(result.intentScore).toBeGreaterThan(60);
    expect(result.locations).toContain("canggu");
    expect(result.propertyTypes).toContain("villa");
    expect(result.budget?.currency).toBe("USD");
    expect(result.reasons.map((r) => r.code)).toContain("buyer_phrase");
  });

  /** `includes()` matching read "not looking for buyers" as buyer intent. */
  it("respects negation", () => {
    const result = classifyWithRules({ ...base, body: "We are not looking for buyers right now." });
    expect(result.intent).not.toBe("buyer");
  });

  it("classifies a structured listing as supply, not demand", () => {
    const result = classifyWithRules({
      ...base,
      body: "Beautiful three-bedroom villa in Sanur, freehold, available now.",
      listingTitle: "3 beds · 3 bath · Villa",
      priceRaw: "IDR2,222",
    });

    expect(result.intent).toBe("seller");
    expect(result.reasons.map((r) => r.code)).toContain("structured_listing");
  });

  /** Supply must never outrank demand in the inbox. */
  it("caps seller intent below the buyer range", () => {
    const seller = classifyWithRules({
      ...base,
      body: "Villa for sale in Seminyak, freehold, price reduced, turnkey, available now, dm for details.",
      listingTitle: "4 beds · 4 bath · Villa",
      priceRaw: "USD 900,000",
    });
    expect(seller.intentScore).toBeLessThanOrEqual(45);
  });
});

describe("classifyWithRules — irrelevance", () => {
  /**
   * Live data surfaced "We are looking for a Property Operations Executive" as a
   * top buyer lead: it trips every buy-intent phrase while being the opposite of
   * demand.
   */
  it("rejects recruitment posts that mimic buy-intent phrasing", () => {
    const result = classifyWithRules({
      ...base,
      body: "We are looking for a Property Operations Executive. Interested candidates send CV to jobs@example.com",
    });

    expect(result.isSpam).toBe(true);
    expect(result.intentScore).toBe(0);
    expect(result.reasons[0].code).toBe("recruitment");
  });

  it("rejects off-topic commercial spam", () => {
    const result = classifyWithRules({
      ...base,
      body: "Trima segala jenis pasang baru instalasi listrik dan trima perbaikkan electrichal dibali",
    });
    expect(result.isSpam).toBe(true);
  });
});

describe("classifyWithRules — scoring axes", () => {
  /**
   * Engagement measures post popularity, not intent to transact. Mixing them
   * lets a popular listing outrank a real buyer.
   */
  it("keeps engagement out of the intent score", () => {
    const quiet = classifyWithRules({ ...base, body: "Looking to buy land in Ubud" });
    const viral = classifyWithRules({
      body: "Looking to buy land in Ubud",
      engagement: { likes: 900, comments: 400, shares: 200 },
    });

    expect(viral.intentScore).toBe(quiet.intentScore);
    expect(viral.reach).toBeGreaterThan(quiet.reach);
  });

  it("separates quality from intent", () => {
    const vague = classifyWithRules({ ...base, body: "Looking to buy something in Bali" });
    const specific = classifyWithRules({
      ...base,
      body: "Looking to buy a villa in Canggu, budget USD 400,000, WhatsApp +6281234567890",
    });
    expect(specific.qualityScore).toBeGreaterThan(vague.qualityScore);
  });

  it("never asserts a WhatsApp number that was not published", () => {
    const result = classifyWithRules({ ...base, body: "Call me on +62 812 3456 7890" });
    expect(result.contact.phone).toBeTruthy();
    expect(result.contact.whatsapp).toBeNull();
  });

  it("does not treat prices or dates as phone numbers", () => {
    const result = classifyWithRules({
      ...base,
      body: "Villa listed 2026-01-08 for IDR 2,500,000,000",
    });
    expect(result.contact.phone).toBeNull();
  });
});

describe("classifyWithRules — engagement_like / engagement_comment", () => {
  /**
   * A "Post Likers" scrape produces a person, not a post — no body text to
   * phrase-match. Before this branch existed, that meant intent="other",
   * score=0, empty reasons, indistinguishable from a genuinely irrelevant
   * record. See docs/lead-source-scaling-plan.md problem 2c.
   */
  it("scores a bare like on a listing via what it engaged with, not body text", () => {
    const result = classifyWithRules({
      body: "",
      recordKind: "engagement_like",
      engagementContext: {
        targetListingTitle: "3 beds · 3 bath · Villa",
        targetPriceRaw: "$400k",
        targetLocationRaw: "Canggu, Bali",
        repeatEngagementCount: 0,
      },
    });

    expect(result.intent).toBe("buyer");
    expect(result.intentScore).toBeGreaterThan(0);
    expect(result.isSpam).toBe(false);
    expect(result.locations).toContain("canggu");
    expect(result.propertyTypes).toContain("villa");
    expect(result.reasons.some((r) => r.code === "engagement_signal")).toBe(true);
  });

  it("never returns a silent zero-signal result — the bug this branch fixes", () => {
    const result = classifyWithRules({ body: "", recordKind: "engagement_like", engagementContext: {} });
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.intent).not.toBe("other");
  });

  it("boosts the score for repeat engagement across multiple listings", () => {
    const once = classifyWithRules({
      body: "",
      recordKind: "engagement_like",
      engagementContext: { repeatEngagementCount: 0 },
    });
    const repeat = classifyWithRules({
      body: "",
      recordKind: "engagement_like",
      engagementContext: { repeatEngagementCount: 3 },
    });
    expect(repeat.intentScore).toBeGreaterThan(once.intentScore);
    expect(repeat.reasons.some((r) => r.code === "repeat_engagement")).toBe(true);
  });

  /**
   * Not the same "engagement is not intent" leak the content-post branch
   * guards against — that rule stops a post's *own* like count inflating its
   * *own* intent. This is the same principle on the reach axis instead: the
   * target post's popularity isn't this *person's* reach.
   */
  it("does not attribute the target post's own like/comment/share counts as this lead's reach", () => {
    const result = classifyWithRules({
      body: "",
      recordKind: "engagement_like",
      engagement: { likes: 500, comments: 40, shares: 10 },
      engagementContext: {},
    });
    expect(result.reach).toBe(0);
  });

  it("never states a budget the person didn't state themselves — the listing's price is informational only", () => {
    const result = classifyWithRules({
      body: "",
      recordKind: "engagement_like",
      engagementContext: { targetPriceRaw: "$400k" },
    });
    expect(result.budget).toBeNull();
    expect(result.reasons.find((r) => r.code === "target_price")?.weight).toBe(0);
  });

  it("returns no contact info — nothing was published by the person in an engagement record", () => {
    const result = classifyWithRules({ body: "", recordKind: "engagement_like", engagementContext: {} });
    expect(result.contact).toEqual({});
  });

  it("labels a comment differently from a like", () => {
    const comment = classifyWithRules({
      body: "",
      recordKind: "engagement_comment",
      engagementContext: {},
    });
    expect(comment.reasons.some((r) => r.label.startsWith("Commented on"))).toBe(true);
  });
});
