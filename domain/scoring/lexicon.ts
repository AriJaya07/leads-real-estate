/**
 * Intent lexicon. Data, not logic — extracted so it can be tuned from observed
 * conversion without touching the scoring algorithm, and eventually moved into
 * the database for non-engineer editing.
 *
 * Indonesian phrases are weighted separately rather than pooled with English:
 * a local posting "cari villa di Canggu" is a stronger buy signal than an
 * English post using the same words incidentally.
 */

export interface Phrase {
  text: string;
  weight: number;
  lang: "en" | "id";
}

/** Explicit intent to acquire. The highest-value signal on the platform. */
export const BUYER_PHRASES: Phrase[] = [
  { text: "looking to buy", weight: 30, lang: "en" },
  { text: "want to buy", weight: 30, lang: "en" },
  { text: "wanting to buy", weight: 30, lang: "en" },
  { text: "planning to buy", weight: 28, lang: "en" },
  { text: "looking to invest", weight: 28, lang: "en" },
  { text: "looking to purchase", weight: 30, lang: "en" },
  { text: "in the market for", weight: 24, lang: "en" },
  { text: "house hunting", weight: 22, lang: "en" },
  { text: "wtb", weight: 26, lang: "en" },
  { text: "looking for a villa", weight: 26, lang: "en" },
  { text: "looking for a house", weight: 26, lang: "en" },
  { text: "looking for land", weight: 26, lang: "en" },
  { text: "looking for", weight: 14, lang: "en" },
  { text: "searching for", weight: 14, lang: "en" },
  { text: "anyone selling", weight: 20, lang: "en" },
  { text: "any recommendations for", weight: 12, lang: "en" },
  { text: "where can i find", weight: 12, lang: "en" },
  { text: "does anyone know of", weight: 12, lang: "en" },
  { text: "my budget is", weight: 26, lang: "en" },
  { text: "budget around", weight: 24, lang: "en" },
  { text: "we are relocating", weight: 18, lang: "en" },
  { text: "moving to bali", weight: 16, lang: "en" },

  { text: "mau beli", weight: 30, lang: "id" },
  { text: "ingin membeli", weight: 30, lang: "id" },
  { text: "cari villa", weight: 28, lang: "id" },
  { text: "cari tanah", weight: 28, lang: "id" },
  { text: "cari rumah", weight: 28, lang: "id" },
  { text: "nyari", weight: 20, lang: "id" },
  { text: "dicari", weight: 24, lang: "id" },
  { text: "butuh", weight: 18, lang: "id" },
  { text: "budget saya", weight: 26, lang: "id" },
];

/** Supply-side. Listings are inventory, not demand — they must pull intent down. */
export const SELLER_PHRASES: Phrase[] = [
  { text: "for sale", weight: 28, lang: "en" },
  { text: "now available", weight: 22, lang: "en" },
  { text: "available now", weight: 22, lang: "en" },
  { text: "price reduced", weight: 24, lang: "en" },
  { text: "freehold", weight: 20, lang: "en" },
  { text: "leasehold", weight: 20, lang: "en" },
  { text: "annual rent", weight: 20, lang: "en" },
  { text: "monthly rent", weight: 20, lang: "en" },
  { text: "yearly rent", weight: 20, lang: "en" },
  { text: "ready to move in", weight: 18, lang: "en" },
  { text: "turnkey", weight: 18, lang: "en" },
  { text: "brand new villa", weight: 20, lang: "en" },
  { text: "dm for details", weight: 18, lang: "en" },
  { text: "dm for price", weight: 18, lang: "en" },
  { text: "contact for price", weight: 18, lang: "en" },
  { text: "price negotiable", weight: 16, lang: "en" },
  { text: "roi", weight: 14, lang: "en" },
  { text: "investment opportunity", weight: 14, lang: "en" },
  { text: "book now", weight: 14, lang: "en" },

  { text: "dijual", weight: 30, lang: "id" },
  { text: "disewakan", weight: 28, lang: "id" },
  { text: "harga nego", weight: 20, lang: "id" },
  { text: "siap huni", weight: 18, lang: "id" },
];

/** Professional supply. Distinct from a private seller — different follow-up. */
export const AGENT_PHRASES: Phrase[] = [
  { text: "our listing", weight: 26, lang: "en" },
  { text: "our listings", weight: 26, lang: "en" },
  { text: "new listing", weight: 22, lang: "en" },
  { text: "our portfolio", weight: 24, lang: "en" },
  { text: "our properties", weight: 24, lang: "en" },
  { text: "our team", weight: 16, lang: "en" },
  { text: "contact our", weight: 18, lang: "en" },
  { text: "exclusive offer", weight: 18, lang: "en" },
  { text: "property agency", weight: 26, lang: "en" },
  { text: "real estate agency", weight: 26, lang: "en" },
  { text: "we are a", weight: 12, lang: "en" },
];

/**
 * Investment framing, distinct from plain buyer intent ("looking to buy") or
 * plain seller/agency copy ("investment opportunity" as a listing hook, already
 * in SELLER_PHRASES). This is about the *person's own* investor framing — buying
 * for yield/return rather than to live in — and feeds `investorScore`
 * (per-appearance, additive, does not change `intent`/`intentScore`).
 */
export const INVESTOR_PHRASES: Phrase[] = [
  { text: "rental yield", weight: 30, lang: "en" },
  { text: "rental income", weight: 26, lang: "en" },
  { text: "passive income", weight: 24, lang: "en" },
  { text: "cap rate", weight: 30, lang: "en" },
  { text: "cash flow", weight: 22, lang: "en" },
  { text: "add to my portfolio", weight: 28, lang: "en" },
  { text: "expand my portfolio", weight: 28, lang: "en" },
  { text: "second property", weight: 20, lang: "en" },
  { text: "investment property", weight: 24, lang: "en" },
  { text: "looking to invest", weight: 26, lang: "en" },
  { text: "adr", weight: 22, lang: "en" },
  { text: "occupancy rate", weight: 24, lang: "en" },
  { text: "airbnb income", weight: 24, lang: "en" },
  { text: "buy to let", weight: 26, lang: "en" },

  { text: "investasi", weight: 26, lang: "id" },
  { text: "sewa tahunan menguntungkan", weight: 22, lang: "id" },
];

/**
 * Licensed/agency-brokerage framing, distinct from a general "our listing"
 * agent post (`AGENT_PHRASES`). Feeds `brokerScore` (per-appearance, additive) —
 * used at the person-rollup level to pick `leadType: "broker"` over `"agent"`
 * when this signal dominates.
 */
export const BROKER_PHRASES: Phrase[] = [
  { text: "licensed broker", weight: 34, lang: "en" },
  { text: "real estate broker", weight: 32, lang: "en" },
  { text: "brokerage", weight: 28, lang: "en" },
  { text: "broker license", weight: 30, lang: "en" },
  { text: "buyer's agent", weight: 22, lang: "en" },
  { text: "co-broke", weight: 26, lang: "en" },
  { text: "commission split", weight: 26, lang: "en" },
];

/**
 * Off-topic commerce posted into property groups. The current pipeline surfaces
 * these as leads; they waste an agent's time and erode trust in the alert channel.
 */
export const SPAM_PHRASES: Phrase[] = [
  { text: "instalasi listrik", weight: 40, lang: "id" },
  { text: "jasa service", weight: 35, lang: "id" },
  { text: "pijat", weight: 40, lang: "id" },
  { text: "obat", weight: 35, lang: "id" },
  { text: "pinjaman", weight: 40, lang: "id" },
  { text: "follow my page", weight: 30, lang: "en" },
  { text: "click the link", weight: 30, lang: "en" },
  { text: "crypto", weight: 35, lang: "en" },
  { text: "forex", weight: 40, lang: "en" },
  { text: "make money online", weight: 45, lang: "en" },
];

/**
 * Recruitment posts. Real data surfaced "We're looking for a Property Operations
 * Executive" as a top buyer lead — it matches every buy-intent phrase while
 * being the exact opposite of a buyer. Detected separately from spam because
 * these are legitimate posts, just not demand.
 */
export const RECRUITMENT_PHRASES: Phrase[] = [
  { text: "we're hiring", weight: 45, lang: "en" },
  { text: "we are hiring", weight: 45, lang: "en" },
  { text: "now hiring", weight: 45, lang: "en" },
  { text: "job vacancy", weight: 45, lang: "en" },
  { text: "job opening", weight: 45, lang: "en" },
  { text: "apply now", weight: 25, lang: "en" },
  { text: "send your cv", weight: 45, lang: "en" },
  { text: "send cv", weight: 45, lang: "en" },
  { text: "send your resume", weight: 45, lang: "en" },
  { text: "interested candidates", weight: 45, lang: "en" },
  { text: "apply directly", weight: 40, lang: "en" },
  { text: "via linkedin", weight: 40, lang: "en" },
  { text: "open to work", weight: 45, lang: "en" },
  { text: "career change", weight: 40, lang: "en" },
  { text: "years in real estate", weight: 40, lang: "en" },
  { text: "we are looking for a", weight: 25, lang: "en" },
  { text: "we're looking for a", weight: 25, lang: "en" },
  { text: "candidates", weight: 20, lang: "en" },
  { text: "salary range", weight: 35, lang: "en" },
  { text: "full-time position", weight: 35, lang: "en" },
  { text: "join our team", weight: 30, lang: "en" },
  { text: "recruitment", weight: 30, lang: "en" },
  { text: "lowongan", weight: 45, lang: "id" },
  { text: "dibutuhkan karyawan", weight: 45, lang: "id" },
];

/**
 * Words that flip the meaning of a following phrase. Without this, "not looking
 * for buyers" scores as a buyer, which is exactly backwards.
 */
export const NEGATORS = [
  "not",
  "no",
  "never",
  "don't",
  "dont",
  "doesn't",
  "doesnt",
  "stop",
  "tidak",
  "bukan",
  "jangan",
];

/** How far back from a phrase match a negator still applies, in characters. */
export const NEGATION_WINDOW = 24;

/**
 * Open vocabulary: the value is a suggestion, and unknown types discovered in
 * data still flow through as-is. Nothing here is a closed enum.
 */
export const PROPERTY_TYPE_TERMS: Record<string, string[]> = {
  villa: ["villa", "villas"],
  land: ["land", "tanah", "plot", "kavling", "lahan"],
  house: ["house", "rumah", "home"],
  apartment: ["apartment", "apartemen", "condo", "condominium", "studio unit"],
  commercial: ["commercial", "shop", "ruko", "office", "restaurant", "cafe", "warehouse", "gudang"],
  hotel: ["hotel", "guesthouse", "hostel", "boutique hotel"],
  resort: ["resort"],
  townhouse: ["townhouse", "town house"],
  penthouse: ["penthouse"],
};

export const BALI_LOCATIONS = [
  "seminyak",
  "canggu",
  "changgu",
  "ubud",
  "kuta",
  "uluwatu",
  "jimbaran",
  "sanur",
  "nusa dua",
  "denpasar",
  "tabanan",
  "lovina",
  "amed",
  "candidasa",
  "pecatu",
  "pererenan",
  "berawa",
  "batu bolong",
  "echo beach",
  "tanah lot",
  "umalas",
  "kerobokan",
  "legian",
  "bukit",
  "ungasan",
  "balangan",
  "bingin",
  "padang padang",
  "nusa penida",
  "nusa lembongan",
  "nusa ceningan",
  "gianyar",
  "karangasem",
  "klungkung",
  "bangli",
  "badung",
  "buleleng",
  "jembrana",
  "munggu",
  "cemagi",
  "tumbak bayuh",
  "seseh",
  "kedungu",
  "bali",
];

/** Merges spelling variants so dynamic location filters don't fragment. */
export const LOCATION_ALIASES: Record<string, string> = {
  changgu: "canggu",
  cangu: "canggu",
  "batu bolong": "canggu",
  berawa: "canggu",
  "echo beach": "canggu",
  umalas: "kerobokan",
};
