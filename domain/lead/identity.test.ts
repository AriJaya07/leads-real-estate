import { describe, expect, it } from "vitest";
import { hasIdentitySignal, identityKeys, mergePersonalInfo, normalizeProfileUrl } from "./identity";

describe("normalizeProfileUrl", () => {
  it("strips protocol, www, trailing slash and query string", () => {
    expect(normalizeProfileUrl("https://www.facebook.com/jane.doe/?ref=share")).toBe(
      "facebook.com/jane.doe",
    );
  });

  it("treats a bare host+path the same as a full URL", () => {
    expect(normalizeProfileUrl("facebook.com/jane.doe")).toBe(
      normalizeProfileUrl("https://www.facebook.com/jane.doe"),
    );
  });

  it("returns null for empty or unparseable input", () => {
    expect(normalizeProfileUrl(null)).toBeNull();
    expect(normalizeProfileUrl(undefined)).toBeNull();
    expect(normalizeProfileUrl("")).toBeNull();
  });
});

describe("identityKeys", () => {
  it("orders keys by precedence: facebookId, then instagramId, then profileUrl", () => {
    const keys = identityKeys({
      facebookId: "fb1",
      instagramId: "ig1",
      profileUrl: "https://facebook.com/fb1",
    });
    expect(keys.map((k) => k.type)).toEqual(["facebookId", "instagramId", "profileUrl"]);
  });

  it("skips absent signals rather than emitting empty keys", () => {
    expect(identityKeys({ profileUrl: "https://facebook.com/jane" })).toEqual([
      { type: "profileUrl", value: "facebook.com/jane" },
    ]);
  });

  it("never uses username as an identity key", () => {
    const keys = identityKeys({ username: "jane.doe" });
    expect(keys).toEqual([]);
  });
});

describe("hasIdentitySignal", () => {
  it("is false when only a username is present", () => {
    expect(hasIdentitySignal({ username: "jane.doe" })).toBe(false);
  });

  it("is true when any of facebookId/instagramId/profileUrl is present", () => {
    expect(hasIdentitySignal({ facebookId: "fb1" })).toBe(true);
  });
});

const BASE_PERSON = {
  facebookId: null,
  instagramId: null,
  profileUrl: null,
  username: null,
  name: null,
  avatarUrl: null,
  location: null,
  bio: null,
};

describe("mergePersonalInfo", () => {
  it("fills a null field from the incoming appearance", () => {
    const merged = mergePersonalInfo(BASE_PERSON, { bio: "Looking to relocate to Bali" });
    expect(merged.bio).toBe("Looking to relocate to Bali");
  });

  /**
   * The core safety property: a later appearance with stale or wrong cached
   * profile data must never silently overwrite a value that's already correct.
   */
  it("never overwrites an existing non-null field", () => {
    const existing = { ...BASE_PERSON, name: "Jane Doe" };
    const merged = mergePersonalInfo(existing, { name: "Someone Else" });
    expect(merged.name).toBe("Jane Doe");
  });

  it("leaves fields with no incoming value untouched", () => {
    const existing = { ...BASE_PERSON, name: "Jane Doe" };
    const merged = mergePersonalInfo(existing, {});
    expect(merged).toEqual(existing);
  });

  it("does not treat an empty string as a fill-worthy value", () => {
    const merged = mergePersonalInfo(BASE_PERSON, { bio: "" });
    expect(merged.bio).toBeNull();
  });
});
