/**
 * Scoring domain. The `LeadClassifier` port is the AI seam: a rules engine today,
 * an LLM tomorrow, both swappable without touching ingestion, storage or UI.
 */

export type LeadIntent = "buyer" | "seller" | "agent" | "other";

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
}

export interface Classification {
  intent: LeadIntent;
  /** 0-100. How strongly the text expresses intent to transact. */
  intentScore: number;
  /** 0-100. How workable the lead is: contactable, specific, budgeted. */
  qualityScore: number;
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
