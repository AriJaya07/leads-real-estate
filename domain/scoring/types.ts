/**
 * Scoring domain. The `LeadClassifier` port is the AI seam: a rules engine today,
 * an LLM tomorrow, both swappable without touching ingestion, storage or UI.
 */

export type LeadIntent = "buyer" | "seller" | "agent" | "other";

/**
 * Person-level business classification — rolled up from every appearance a
 * lead has, via `domain/scoring/lead-rollup.ts`. Deliberately a separate type
 * from `LeadIntent`: intent is what *one post* looks like; `LeadType` is what
 * *this person* looks like across everything they've done. `"broker"` and
 * `"investor"` have no `LeadIntent` equivalent — they only exist at the rollup
 * level, fed by additive per-appearance signals (`investorScore`/`brokerScore`
 * on `Classification`) rather than the primary intent pick.
 */
export type LeadType = "buyer" | "seller" | "agent" | "broker" | "investor" | "unknown";

/**
 * What a record *is*, independent of its intent. `content_post` has body text
 * to classify; `engagement_*` kinds don't — they're a person's reaction to
 * someone else's post, scored on what they engaged with instead (see
 * `EngagementContext`).
 */
export type LeadRecordKind = "content_post" | "engagement_like" | "engagement_comment";

/**
 * What an `engagement_*` record engaged with. Populated from the raw payload's
 * denormalized snapshot of the target post at scrape time — the target post
 * itself may never be ingested as its own record.
 */
export interface EngagementContext {
  targetPostExternalId?: string | null;
  targetPostUrl?: string | null;
  targetListingTitle?: string | null;
  targetPriceRaw?: string | null;
  targetLocationRaw?: string | null;
  /** How many distinct posts this same person engaged with in the lookback window. */
  repeatEngagementCount?: number;
}

export interface ContactInfo {
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
}

export interface BudgetRange {
  min: number | null;
  max: number | null;
  currency: string;
}

/**
 * Every scoring decision carries its evidence. Agents ignore a naked number;
 * they act on "scored 82 because it says 'looking to buy' and states a budget".
 */
export interface ScoreReason {
  code: string;
  label: string;
  weight: number;
  evidence?: string;
}

export interface ClassifierInput {
  body: string;
  listingTitle?: string | null;
  locationRaw?: string | null;
  priceRaw?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  engagement?: { likes: number; comments: number; shares: number };
  sourceGroup?: string | null;
  postedAt?: Date;
  /** Defaults to `content_post` when omitted — every source before this field existed. */
  recordKind?: LeadRecordKind;
  engagementContext?: EngagementContext;
}

export interface Classification {
  intent: LeadIntent;
  /** 0-100. How strongly the text expresses intent to transact. */
  intentScore: number;
  /** 0-100. How workable the lead is: contactable, specific, budgeted. */
  qualityScore: number;
  /**
   * 0-100, additive — does not change `intent`/`intentScore`. Investment
   * framing ("rental yield", "cap rate") can co-occur with buyer intent; this
   * is a parallel signal consumed only by person-level rollup
   * (`domain/scoring/lead-rollup.ts`), not by this appearance's own intent pick.
   */
  investorScore: number;
  /** 0-100, additive. Licensed-broker framing, feeds `leadType` rollup only. */
  brokerScore: number;
  /** Separate from intent — post popularity is not buying intent. */
  reach: number;
  isSpam: boolean;
  propertyTypes: string[];
  locations: string[];
  budget: BudgetRange | null;
  contact: ContactInfo;
  bedrooms: number | null;
  bathrooms: number | null;
  reasons: ScoreReason[];
  classifierId: string;
  classifiedAt: string;
}

export interface LeadClassifier {
  readonly id: string;
  classify(input: ClassifierInput): Promise<Classification>;
}
