import type { Phrase } from "../lexicon";

/**
 * Travel-vertical intent lexicon — same shape as `../lexicon.ts`'s
 * real-estate phrase lists, selected via `../lexicon-registry.ts` when a
 * company's `category` is `"travel"`. Starter set, tune from observed
 * conversion the same way the real-estate lexicon's own doc comment
 * describes — not exhaustive.
 */

export const TRAVEL_BUYER_PHRASES: Phrase[] = [
  { text: "looking for a trip to", weight: 28, lang: "en" },
  { text: "want to book", weight: 26, lang: "en" },
  { text: "planning a trip to bali", weight: 28, lang: "en" },
  { text: "looking for flights to", weight: 26, lang: "en" },
  { text: "need a hotel in", weight: 24, lang: "en" },
  { text: "where to stay in", weight: 18, lang: "en" },
  { text: "any recommendations for a hotel", weight: 16, lang: "en" },
  { text: "any recommendations for", weight: 12, lang: "en" },
  { text: "my budget for this trip", weight: 24, lang: "en" },
  { text: "traveling to bali", weight: 16, lang: "en" },
  { text: "honeymoon package", weight: 22, lang: "en" },
  { text: "looking for a tour guide", weight: 22, lang: "en" },

  { text: "mau liburan", weight: 26, lang: "id" },
  { text: "cari tiket", weight: 26, lang: "id" },
  { text: "butuh hotel", weight: 22, lang: "id" },
  { text: "rencana liburan ke bali", weight: 26, lang: "id" },
  { text: "cari paket wisata", weight: 28, lang: "id" },
  { text: "budget liburan", weight: 22, lang: "id" },
];

export const TRAVEL_SELLER_PHRASES: Phrase[] = [
  { text: "available dates", weight: 20, lang: "en" },
  { text: "book now", weight: 18, lang: "en" },
  { text: "limited seats", weight: 20, lang: "en" },
  { text: "special rate", weight: 18, lang: "en" },
  { text: "package deal", weight: 16, lang: "en" },
  { text: "promo tiket", weight: 20, lang: "id" },
  { text: "open trip", weight: 20, lang: "id" },
  { text: "sisa slot", weight: 18, lang: "id" },
];

export const TRAVEL_AGENT_PHRASES: Phrase[] = [
  { text: "travel agent", weight: 22, lang: "en" },
  { text: "tour operator", weight: 22, lang: "en" },
  { text: "authorized agent", weight: 18, lang: "en" },
  { text: "biro perjalanan", weight: 22, lang: "id" },
  { text: "agen resmi", weight: 18, lang: "id" },
];

export const TRAVEL_INVESTOR_PHRASES: Phrase[] = [
  { text: "corporate travel", weight: 20, lang: "en" },
  { text: "group booking", weight: 18, lang: "en" },
  { text: "mice event", weight: 18, lang: "en" },
  { text: "rombongan besar", weight: 18, lang: "id" },
];

export const TRAVEL_BROKER_PHRASES: Phrase[] = [
  { text: "licensed travel agency", weight: 20, lang: "en" },
  { text: "iata certified", weight: 22, lang: "en" },
  { text: "member asita", weight: 20, lang: "id" },
];
