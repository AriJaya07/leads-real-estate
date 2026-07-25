import { describe, expect, it } from "vitest";
import { inferSchema } from "./schema-inference";
import { proposeMapping } from "./mapping-proposal";

const FACEBOOK_SAMPLE = [
  {
    id: "post-1",
    url: "https://facebook.com/p/1",
    time: "2026-01-08T18:08:53.000Z",
    text: "Sanur Beachside – Three-Bedroom Villa with Private Pool",
    user: { id: "u1", name: "Hi Taka", profilePic: "https://cdn/avatar.jpg" },
    groupTitle: "Bali Property",
    likesCount: 4,
    commentsCount: 2,
    sharesCount: 1,
    attachments: [
      { ocrText: "No photo description available.", __typename: "Photo", thumbnail: "https://cdn/1.jpg" },
      { ocrText: "No photo description available.", __typename: "Photo", thumbnail: "https://cdn/2.jpg" },
      { ocrText: "No photo description available.", __typename: "Photo", thumbnail: "https://cdn/3.jpg" },
    ],
  },
];

describe("proposeMapping", () => {
  const proposal = proposeMapping(inferSchema(FACEBOOK_SAMPLE));

  /**
   * Regression from a live run: the proposal mapped `body` to
   * `attachments[].ocrText` and `authorName` to `attachments[].__typename`,
   * producing leads whose author was "Photo,Photo,Photo" and whose body was
   * image alt text. Array-element paths must lose to real top-level fields.
   */
  it("prefers top-level fields over paths inside arrays", () => {
    expect(proposal.rules.body?.from[0]).toBe("text");
    expect(proposal.rules.authorName?.from[0]).toBe("user.name");
  });

  it("keeps runners-up as fallback candidates for shape drift", () => {
    expect(proposal.rules.body?.from.length).toBeGreaterThan(1);
  });

  it("maps engagement counters", () => {
    expect(proposal.rules.engagement).toMatchObject({
      likes: "likesCount",
      comments: "commentsCount",
      shares: "sharesCount",
    });
  });

  it("reports confidence and what it could not match", () => {
    expect(proposal.confidence).toBeGreaterThan(0);
    expect(proposal.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(proposal.unmatched)).toBe(true);
  });

  it("returns low confidence for a payload it does not understand", () => {
    const opaque = proposeMapping(inferSchema([{ zzz: 1, qqq: 2 }]));
    expect(opaque.confidence).toBeLessThan(0.8);
  });
});
