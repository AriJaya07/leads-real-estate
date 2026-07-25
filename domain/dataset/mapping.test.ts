import { describe, expect, it } from "vitest";
import { applyMapping, parseBedrooms, parseMoney, resolvePath } from "./mapping";
import type { MappingRules } from "./types";

/** Trimmed from a real item in the live `facebook-group-real-estate` dataset. */
const REAL_POST = {
  facebookUrl: "https://www.facebook.com/groups/467045033467452",
  url: "https://www.facebook.com/groups/467045033467452/permalink/3176254389213156/",
  time: "2026-01-08T18:08:53.000Z",
  user: { id: "pfbid0MF", name: "Hi Taka", profilePic: "https://scontent.example/avatar.jpg" },
  text: "Sanur Beachside – Three-Bedroom Villa with Private Pool",
  id: "UzpfSTYxNTUyNTk5MDY3NjI1OlZLOjMxNzYyNTQzODkyMTMxNTY=",
  legacyId: "3176254389213156",
  title: "3 beds · 3 bath · Villa",
  price: "IDR2,222",
  location: "Denpasar, Bali",
  attachments: [
    { thumbnail: "https://scontent.example/t.jpg", photo_image: { uri: "https://scontent.example/full.jpg" } },
  ],
  likesCount: 4,
  sharesCount: 1,
  commentsCount: 2,
  groupTitle: "Bali Property - Villas & Land",
  inputUrl: "https://www.facebook.com/groups/467045033467452",
  paidPartnership: false,
};

const RULES: MappingRules = {
  externalId: { from: ["id", "legacyId"] },
  externalUrl: { from: ["url", "facebookUrl"] },
  sourceGroup: {
    from: ["groupTitle", "groupName"],
    fallback: { on: "inputUrl", regex: "groups/([^/?]+)" },
  },
  authorName: { from: ["user.name", "authorName"] },
  authorAvatarUrl: { from: ["user.profilePic", "authorProfilePicture"] },
  authorExternalId: { from: ["user.id"] },
  body: { from: ["text"] },
  listingTitle: { from: ["title"] },
  images: { from: ["attachments[].photo_image.uri", "images"], transform: "flattenUnique" },
  postedAt: { from: ["time", "timestamp"], transform: "toIso8601" },
  priceRaw: { from: ["price"] },
  locationRaw: { from: ["location"] },
  bedrooms: { from: ["title"], transform: "parseBedrooms" },
  engagement: { likes: "likesCount", comments: "commentsCount", shares: "sharesCount" },
};

describe("resolvePath", () => {
  it("reads nested keys", () => {
    expect(resolvePath(REAL_POST, "user.name")).toBe("Hi Taka");
  });

  it("fans out across array elements", () => {
    expect(resolvePath(REAL_POST, "attachments[].photo_image.uri")).toEqual([
      "https://scontent.example/full.jpg",
    ]);
  });

  it("returns undefined for missing paths rather than throwing", () => {
    expect(resolvePath(REAL_POST, "nope.deeper.still")).toBeUndefined();
  });
});

describe("applyMapping", () => {
  const result = applyMapping(REAL_POST, RULES, { passthrough: true });

  /**
   * The audit found the previous hand-written interface expected `authorName`,
   * `groupName` and `images[]`, none of which exist in the real payload — every
   * lead rendered as "Unknown" with no images.
   */
  it("maps the real Facebook shape onto canonical fields", () => {
    expect(result.authorName).toBe("Hi Taka");
    expect(result.sourceGroup).toBe("Bali Property - Villas & Land");
    expect(result.images).toEqual(["https://scontent.example/full.jpg"]);
    expect(result.listingTitle).toBe("3 beds · 3 bath · Villa");
    expect(result.priceRaw).toBe("IDR2,222");
    expect(result.locationRaw).toBe("Denpasar, Bali");
    expect(result.bedrooms).toBe(3);
    expect(result.engagement).toEqual({ likes: 4, comments: 2, shares: 1 });
  });

  it("falls through the candidate list when the preferred path is absent", () => {
    const legacy = { ...REAL_POST, user: undefined, authorName: "Legacy Name" };
    expect(applyMapping(legacy, RULES).authorName).toBe("Legacy Name");
  });

  it("uses the regex fallback when no candidate resolves", () => {
    const noGroup = { ...REAL_POST, groupTitle: undefined };
    expect(applyMapping(noGroup, RULES).sourceGroup).toBe("467045033467452");
  });

  it("keeps unmapped fields in attributes so they stay filterable", () => {
    expect(result.attributes).toHaveProperty("paidPartnership", false);
    expect(result.attributes).not.toHaveProperty("text");
  });

  /**
   * A missing timestamp must not become "now" — that would make every backfilled
   * post look brand new and corrupt recency ranking and alerting.
   */
  it("does not invent a timestamp when none is present", () => {
    const undated = applyMapping({ ...REAL_POST, time: undefined }, RULES);
    expect(undated.postedAt.getTime()).toBe(0);
  });
});

describe("parseMoney", () => {
  it.each([
    ["IDR2,222", 2222],
    ["$1.2M", 1_200_000],
    ["Rp 5 miliar", 5_000_000_000],
    ["500k", 500_000],
    ["250 juta", 250_000_000],
  ])("parses %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it("returns null for non-monetary text", () => {
    expect(parseMoney("no price here")).toBeNull();
  });
});

describe("parseBedrooms", () => {
  it("reads the structured listing title", () => {
    expect(parseBedrooms("3 beds · 3 bath · Villa")).toBe(3);
    expect(parseBedrooms("2 Bedroom Villa")).toBe(2);
  });
});
