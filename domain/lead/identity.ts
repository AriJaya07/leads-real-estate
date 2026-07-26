/**
 * Person-identity resolution: "is this appearance the same human as an
 * existing lead." Deterministic and exact-match only — never fuzzy name
 * matching. A wrong merge (two different "John Wilson"s collapsed into one
 * lead) is worse than a duplicate lead, same risk posture as the rest of this
 * codebase (see architecture.md's "curated beats auto-proposal").
 *
 * Precedence when more than one identity signal is present: facebookId,
 * then instagramId, then profileUrl. Username alone is never used to merge —
 * usernames aren't guaranteed unique or stable across platforms, only useful
 * for display.
 */

export interface IdentityCandidate {
  facebookId?: string | null;
  instagramId?: string | null;
  profileUrl?: string | null;
  username?: string | null;
}

export type IdentityKeyType = "facebookId" | "instagramId" | "profileUrl";

export interface IdentityKey {
  type: IdentityKeyType;
  value: string;
}

/**
 * Strips protocol, `www.`, trailing slash, query string and fragment so
 * `https://facebook.com/jane.doe/?ref=share` and `facebook.com/jane.doe`
 * resolve to the same identity key.
 */
export function normalizeProfileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "");
    return path ? `${host}${path}` : host || null;
  } catch {
    return null;
  }
}

/**
 * Ordered identity keys to look an existing person up by, precedence-first.
 * The caller (application layer, which owns the DB round-trip) checks each in
 * order and takes the first match — see `application/leads/identity-resolution.ts`.
 */
export function identityKeys(candidate: IdentityCandidate): IdentityKey[] {
  const keys: IdentityKey[] = [];
  if (candidate.facebookId) keys.push({ type: "facebookId", value: candidate.facebookId });
  if (candidate.instagramId) keys.push({ type: "instagramId", value: candidate.instagramId });
  const profileUrl = normalizeProfileUrl(candidate.profileUrl);
  if (profileUrl) keys.push({ type: "profileUrl", value: profileUrl });
  return keys;
}

export function hasIdentitySignal(candidate: IdentityCandidate): boolean {
  return identityKeys(candidate).length > 0;
}

export interface PersonalInfo {
  facebookId: string | null;
  instagramId: string | null;
  profileUrl: string | null;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  location: string | null;
  bio: string | null;
}

/**
 * Fill-nulls-only merge: an appearance can add information an existing lead
 * is missing, but never overwrite a value that's already there. Simpler and
 * safer than "most recent wins" — a later appearance with stale or wrong
 * cached profile data can't silently clobber a correct earlier value. If a
 * genuinely stale field needs correcting, that's a human edit, not an
 * automatic one — same principle as `lead_states` never being overwritten by
 * reprocessing.
 */
export function mergePersonalInfo(existing: PersonalInfo, incoming: Partial<PersonalInfo>): PersonalInfo {
  const merged = { ...existing };
  for (const key of Object.keys(existing) as (keyof PersonalInfo)[]) {
    const incomingValue = incoming[key];
    if (merged[key] === null && incomingValue !== undefined && incomingValue !== null && incomingValue !== "") {
      merged[key] = incomingValue;
    }
  }
  return merged;
}
