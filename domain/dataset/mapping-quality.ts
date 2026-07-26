import {
  MAPPING_QUALITY_MAX_EMPTY_BODY_RATE,
  MAPPING_QUALITY_MAX_SPAM_RATE,
  MAPPING_QUALITY_MIN_SAMPLE,
} from "@/shared/constants";

/**
 * Backstop for auto-approved mapping profiles.
 *
 * A curated, hand-verified profile always beats an auto-proposal (see
 * `mapping-proposal.ts`), but a proposal confident enough to auto-approve still
 * gets applied with zero human review. A wrong-but-plausible mapping — pointed at
 * the wrong field for "body", say — looks like it worked: ingestion succeeds, it
 * just quietly produces spam-flagged or empty-body leads. This checks the first
 * batch such a profile produces and says whether it's suspect enough to pull back
 * for review, rather than trusting it silently forever.
 */

export interface MappingQualitySample {
  total: number;
  spam: number;
  emptyBody: number;
  /**
   * Defaults to `content_post`. `engagement_*` records are *supposed* to have
   * no body text — that's not a mapping error, it's the shape of the content —
   * so the empty-body check is skipped for them. The spam check still applies
   * (an engagement record is never classified spam today, so it's a no-op, not
   * a gap) in case that ever changes.
   */
  recordKind?: "content_post" | "engagement_like" | "engagement_comment";
}

export interface MappingQualityAssessment {
  suspect: boolean;
  reason: string | null;
}

export function assessMappingQuality(sample: MappingQualitySample): MappingQualityAssessment {
  if (sample.total < MAPPING_QUALITY_MIN_SAMPLE) {
    return { suspect: false, reason: null };
  }

  const spamRate = sample.spam / sample.total;
  if (spamRate > MAPPING_QUALITY_MAX_SPAM_RATE) {
    return {
      suspect: true,
      reason:
        `${Math.round(spamRate * 100)}% of the first ${sample.total} records classified as spam — ` +
        `the auto-generated mapping may be pointed at the wrong fields`,
    };
  }

  const isEngagement = sample.recordKind === "engagement_like" || sample.recordKind === "engagement_comment";
  if (!isEngagement) {
    const emptyBodyRate = sample.emptyBody / sample.total;
    if (emptyBodyRate > MAPPING_QUALITY_MAX_EMPTY_BODY_RATE) {
      return {
        suspect: true,
        reason:
          `${Math.round(emptyBodyRate * 100)}% of the first ${sample.total} records have no body text — ` +
          `the auto-generated mapping may be pointed at the wrong fields`,
      };
    }
  }

  return { suspect: false, reason: null };
}
