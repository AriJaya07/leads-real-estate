import type { CanonicalField, FieldProfile, FieldRule, MappingRules } from "./types";

/**
 * Proposes a mapping profile for a newly discovered dataset by matching its
 * inferred paths against known synonyms for each canonical field.
 *
 * A wrong auto-map is worse than no map, because it looks like it worked. So the
 * proposal carries a confidence score and anything below the approval floor is
 * held for admin review rather than applied silently.
 */

interface Candidate {
  /** Matched against the last path segment, case-insensitively. */
  synonyms: string[];
  transform?: FieldRule["transform"];
  /** Preference when several paths match; higher wins. */
  weight?: number;
  /** Restrict to these inferred types. */
  types?: FieldProfile["type"][];
}

const FIELD_SYNONYMS: Record<CanonicalField, Candidate> = {
  externalId: { synonyms: ["id", "postid", "legacyid", "itemid", "uuid"], weight: 3 },
  externalUrl: { synonyms: ["url", "posturl", "permalink", "link", "facebookurl"], weight: 3 },
  sourceGroup: { synonyms: ["grouptitle", "groupname", "group", "channel", "source"] },
  authorName: { synonyms: ["name", "authorname", "username", "ownername", "fullname"] },
  authorUrl: { synonyms: ["authorurl", "profileurl", "userurl", "profilelink"] },
  authorAvatarUrl: {
    synonyms: ["profilepic", "profilepicture", "avatar", "authorprofilepicture", "picture"],
  },
  authorExternalId: { synonyms: ["userid", "authorid", "ownerid"] },
  body: { synonyms: ["text", "message", "content", "caption", "description", "body"], weight: 3 },
  listingTitle: { synonyms: ["title", "headline", "subject"] },
  images: {
    synonyms: ["images", "uri", "thumbnail", "photo", "photos", "picture", "media"],
    transform: "flattenUnique",
  },
  postedAt: {
    synonyms: ["time", "timestamp", "createdat", "publishedat", "date", "postedat"],
    transform: "toIso8601",
    weight: 3,
  },
  priceRaw: { synonyms: ["price", "amount", "cost", "harga"] },
  locationRaw: { synonyms: ["location", "place", "city", "address", "lokasi"] },
  bedrooms: { synonyms: ["bedrooms", "beds", "kamartidur"], transform: "parseBedrooms" },
  bathrooms: { synonyms: ["bathrooms", "baths", "kamarmandi"], transform: "parseBathrooms" },
};

const ENGAGEMENT_SYNONYMS = {
  likes: ["likescount", "likes", "reactionscount", "topreactionscount"],
  comments: ["commentscount", "comments", "commentcount"],
  shares: ["sharescount", "shares", "sharecount"],
};

function lastSegment(path: string): string {
  const parts = path.replace(/\[\]/g, "").split(".");
  return parts[parts.length - 1].toLowerCase();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface Scored {
  path: string;
  score: number;
}

function scoreCandidates(profiles: FieldProfile[], candidate: Candidate): Scored[] {
  const results: Scored[] = [];

  for (const profile of profiles) {
    if (candidate.types && !candidate.types.includes(profile.type)) continue;
    // A field that is almost always empty is not a credible mapping target.
    if (profile.fillRate < 0.05) continue;

    const segment = normalize(lastSegment(profile.path));
    let score = 0;

    for (const synonym of candidate.synonyms) {
      const needle = normalize(synonym);
      if (segment === needle) score = Math.max(score, 1);
      else if (segment.endsWith(needle) || segment.startsWith(needle)) score = Math.max(score, 0.75);
      else if (segment.includes(needle)) score = Math.max(score, 0.5);
    }

    if (score === 0) continue;

    // Prefer well-populated, shallow paths.
    score *= 0.6 + 0.4 * profile.fillRate;
    score /= 1 + profile.path.split(".").length * 0.05;

    /**
     * Strongly demote paths inside arrays. A repeated sub-object usually holds
     * media or metadata, not the record's identity: without this, a payload with
     * six attachments maps the post body to image alt text and the author name
     * to an attachment's `__typename`.
     */
    if (profile.path.includes("[]")) score *= 0.35;

    results.push({ path: profile.path, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

export interface MappingProposal {
  rules: MappingRules;
  /** 0..1 — mean strength across the fields that actually matter. */
  confidence: number;
  unmatched: CanonicalField[];
}

/** Fields whose absence means the proposal is not usable. */
const REQUIRED_FIELDS: CanonicalField[] = ["externalId", "body", "postedAt"];

export function proposeMapping(profiles: FieldProfile[]): MappingProposal {
  const rules: MappingRules = {};
  const unmatched: CanonicalField[] = [];
  const scores: number[] = [];

  for (const [field, candidate] of Object.entries(FIELD_SYNONYMS) as [
    CanonicalField,
    Candidate,
  ][]) {
    const matches = scoreCandidates(profiles, candidate);
    if (matches.length === 0) {
      unmatched.push(field);
      if (REQUIRED_FIELDS.includes(field)) scores.push(0);
      continue;
    }

    // Keep the runners-up as fallback candidates — that redundancy is what makes
    // the profile survive an upstream rename.
    const from = matches.slice(0, 3).map((m) => m.path);
    rules[field] = { from, ...(candidate.transform ? { transform: candidate.transform } : {}) };

    const weight = candidate.weight ?? 1;
    for (let i = 0; i < weight; i++) scores.push(Math.min(matches[0].score, 1));
  }

  const engagement: Record<string, string> = {};
  for (const [key, synonyms] of Object.entries(ENGAGEMENT_SYNONYMS)) {
    const match = scoreCandidates(profiles, { synonyms, types: ["number"] })[0];
    if (match) engagement[key] = match.path;
  }
  if (Object.keys(engagement).length > 0) rules.engagement = engagement;

  const confidence = scores.length
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3))
    : 0;

  return { rules, confidence, unmatched };
}
