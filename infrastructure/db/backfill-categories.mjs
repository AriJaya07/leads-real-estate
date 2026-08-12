/**
 * One-time backfill for the categories migration (pass 1 already applied —
 * `categories`/`category_lexicon_phrases` tables and nullable
 * `companies.category_id`/`actor_templates.category_id` columns exist).
 * This script:
 *  1. Seeds the four `categories` rows with the fixed ids from
 *     `domain/verticals/seed-ids.ts` (label/description/fieldLabels copied
 *     from the now-deleted `domain/verticals/catalog.ts::VERTICALS`) and
 *     their starting lexicon phrases (copied from the now-legacy
 *     `domain/scoring/lexicon.ts` + `domain/scoring/lexicons/{travel,courses}.ts`
 *     — this script is a point-in-time snapshot of that data, not a synced
 *     mirror; those TS files stay in the repo for historical reference only).
 *  2. Backfills `companies.category_id`/`actor_templates.category_id` from
 *     their old enum column.
 *
 * Idempotent — safe to re-run. Run against every DB before applying pass 2
 * (which drops the old columns): node --env-file=.env infrastructure/db/backfill-categories.mjs
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const SEED_CATEGORY_IDS = {
  real_estate: "1daeab11-44b1-51b5-b13d-e40f02d76a3f",
  travel: "2c5f00d3-6824-5f39-902e-46da29869ee5",
  courses: "d10de773-4b91-5ee4-845e-2a130a96396c",
  other: "a92c5632-8cd4-5c4c-be0a-1a7169f875a9",
};

const CATEGORIES = [
  {
    slug: "real_estate",
    label: "Real Estate",
    description: "Villas, land, and property — buyers, sellers, agents, and investors.",
    fieldLabels: {
      categoryField: "Property types",
      wants: "Property types",
      budget: "Budget",
      locations: "Locations",
      companyName: "Agency name",
      companyNamePlaceholder: "Bukit Villa Partners",
    },
  },
  {
    slug: "travel",
    label: "Travel",
    description: "Trips, tours, and stays — travelers, operators, and agents.",
    fieldLabels: {
      categoryField: "Trip types",
      wants: "Trip interests",
      budget: "Budget",
      locations: "Destinations",
      companyName: "Company name",
      companyNamePlaceholder: "Nomad Journeys Co",
    },
  },
  {
    slug: "courses",
    label: "Courses",
    description: "Classes, certifications, and workshops — students, providers, and referrers.",
    fieldLabels: {
      categoryField: "Course types",
      wants: "Course interests",
      budget: "Budget",
      locations: "Locations",
      companyName: "Provider name",
      companyNamePlaceholder: "Bali Yoga Academy",
    },
  },
  {
    slug: "other",
    label: "Other",
    description: "A different kind of business — generic labels and classifier by default.",
    fieldLabels: {
      categoryField: "Categories",
      wants: "Interests",
      budget: "Budget",
      locations: "Locations",
      companyName: "Company name",
      companyNamePlaceholder: "Your company",
    },
  },
];

// Copied from domain/scoring/lexicon.ts (real_estate — also reused for
// "other", matching that category's pre-dynamic fallback behavior) and
// domain/scoring/lexicons/{travel,courses}.ts.
const LEXICON_PHRASES = {
  real_estate: {
    buyer: [
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
    ],
    seller: [
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
    ],
    agent: [
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
    ],
    investor: [
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
    ],
    broker: [
      { text: "licensed broker", weight: 34, lang: "en" },
      { text: "real estate broker", weight: 32, lang: "en" },
      { text: "brokerage", weight: 28, lang: "en" },
      { text: "broker license", weight: 30, lang: "en" },
      { text: "buyer's agent", weight: 22, lang: "en" },
      { text: "co-broke", weight: 26, lang: "en" },
      { text: "commission split", weight: 26, lang: "en" },
    ],
  },
  travel: {
    buyer: [
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
    ],
    seller: [
      { text: "available dates", weight: 20, lang: "en" },
      { text: "book now", weight: 18, lang: "en" },
      { text: "limited seats", weight: 20, lang: "en" },
      { text: "special rate", weight: 18, lang: "en" },
      { text: "package deal", weight: 16, lang: "en" },
      { text: "promo tiket", weight: 20, lang: "id" },
      { text: "open trip", weight: 20, lang: "id" },
      { text: "sisa slot", weight: 18, lang: "id" },
    ],
    agent: [
      { text: "travel agent", weight: 22, lang: "en" },
      { text: "tour operator", weight: 22, lang: "en" },
      { text: "authorized agent", weight: 18, lang: "en" },
      { text: "biro perjalanan", weight: 22, lang: "id" },
      { text: "agen resmi", weight: 18, lang: "id" },
    ],
    investor: [
      { text: "corporate travel", weight: 20, lang: "en" },
      { text: "group booking", weight: 18, lang: "en" },
      { text: "mice event", weight: 18, lang: "en" },
      { text: "rombongan besar", weight: 18, lang: "id" },
    ],
    broker: [
      { text: "licensed travel agency", weight: 20, lang: "en" },
      { text: "iata certified", weight: 22, lang: "en" },
      { text: "member asita", weight: 20, lang: "id" },
    ],
  },
  courses: {
    buyer: [
      { text: "looking for a course", weight: 28, lang: "en" },
      { text: "want to learn", weight: 22, lang: "en" },
      { text: "need certification in", weight: 26, lang: "en" },
      { text: "any recommendations for a course", weight: 18, lang: "en" },
      { text: "where can i study", weight: 16, lang: "en" },
      { text: "looking to enroll", weight: 26, lang: "en" },
      { text: "my budget for this course", weight: 24, lang: "en" },
      { text: "looking for a class in", weight: 24, lang: "en" },
      { text: "mau belajar", weight: 24, lang: "id" },
      { text: "cari kursus", weight: 28, lang: "id" },
      { text: "butuh sertifikasi", weight: 26, lang: "id" },
      { text: "cari pelatihan", weight: 26, lang: "id" },
      { text: "budget kursus", weight: 22, lang: "id" },
    ],
    seller: [
      { text: "enrolling now", weight: 20, lang: "en" },
      { text: "new batch starting", weight: 20, lang: "en" },
      { text: "limited seats", weight: 18, lang: "en" },
      { text: "early bird price", weight: 18, lang: "en" },
      { text: "kelas baru dibuka", weight: 20, lang: "id" },
      { text: "pendaftaran dibuka", weight: 20, lang: "id" },
    ],
    agent: [
      { text: "course consultant", weight: 20, lang: "en" },
      { text: "education agent", weight: 20, lang: "en" },
      { text: "konsultan pendidikan", weight: 20, lang: "id" },
    ],
    investor: [
      { text: "corporate training", weight: 20, lang: "en" },
      { text: "bulk enrollment", weight: 18, lang: "en" },
      { text: "company training program", weight: 18, lang: "en" },
      { text: "pelatihan karyawan", weight: 18, lang: "id" },
    ],
    broker: [
      { text: "accredited provider", weight: 20, lang: "en" },
      { text: "certified institution", weight: 20, lang: "en" },
      { text: "terakreditasi", weight: 18, lang: "id" },
    ],
  },
};
// "other" reuses real_estate's phrases — same fallback the old
// lexicon-registry.ts used before categories were dynamic.
LEXICON_PHRASES.other = LEXICON_PHRASES.real_estate;

try {
  for (const cat of CATEGORIES) {
    const id = SEED_CATEGORY_IDS[cat.slug];
    await sql`
      INSERT INTO categories (id, slug, label, description, field_labels, status)
      VALUES (${id}, ${cat.slug}, ${cat.label}, ${cat.description}, ${sql.json(cat.fieldLabels)}, 'active')
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label, description = EXCLUDED.description, field_labels = EXCLUDED.field_labels
    `;

    const bundle = LEXICON_PHRASES[cat.slug];
    for (const intent of Object.keys(bundle)) {
      for (const phrase of bundle[intent]) {
        await sql`
          INSERT INTO category_lexicon_phrases (category_id, intent, phrase, weight, lang)
          VALUES (${id}, ${intent}, ${phrase.text}, ${phrase.weight}, ${phrase.lang})
          ON CONFLICT (category_id, intent, phrase, lang) DO UPDATE SET weight = EXCLUDED.weight
        `;
      }
    }
    console.log(`categories: seeded "${cat.slug}" (${Object.values(bundle).flat().length} lexicon phrases)`);
  }

  const companiesResult = await sql`
    UPDATE companies SET category_id = categories.id
    FROM categories
    WHERE companies.category::text = categories.slug AND companies.category_id IS NULL
  `;
  console.log(`companies: backfilled ${companiesResult.count} row(s)`);

  const templatesResult = await sql`
    UPDATE actor_templates SET category_id = categories.id
    FROM categories
    WHERE actor_templates.category IS NOT NULL
      AND actor_templates.category::text = categories.slug
      AND actor_templates.category_id IS NULL
  `;
  console.log(`actor_templates: backfilled ${templatesResult.count} row(s)`);

  console.log("\nbackfill complete");
} catch (error) {
  console.error("backfill failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
