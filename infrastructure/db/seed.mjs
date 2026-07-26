/**
 * Seeds the baseline configuration that used to live in environment variables:
 * the Apify source, a known-good mapping profile for the Facebook Groups actor,
 * the CEO's priority alert rule, and location aliases.
 *
 * Idempotent — safe to re-run.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

/**
 * Verified against the live dataset shape rather than guessed. Candidate lists
 * include both the current field names (`user.name`, `groupTitle`) and the older
 * flat ones (`authorName`, `groupName`), so the profile survives either shape.
 */
const facebookRules = {
  externalId: { from: ["id", "legacyId", "postId"] },
  externalUrl: { from: ["url", "facebookUrl", "inputUrl"] },
  sourceGroup: {
    from: ["groupTitle", "groupName"],
    fallback: { on: "inputUrl", regex: "groups/([^/?]+)" },
  },
  authorName: { from: ["user.name", "authorName"], default: null },
  authorUrl: { from: ["user.url", "authorUrl"] },
  authorAvatarUrl: { from: ["user.profilePic", "authorProfilePicture"] },
  authorExternalId: { from: ["user.id", "authorId"] },
  body: { from: ["text", "message", "content"] },
  listingTitle: { from: ["title"] },
  images: {
    from: ["attachments[].photo_image.uri", "attachments[].thumbnail", "images", "thumbnailUrl"],
    transform: "flattenUnique",
  },
  postedAt: { from: ["time", "timestamp"], transform: "toIso8601" },
  priceRaw: { from: ["price"] },
  locationRaw: { from: ["location"] },
  bedrooms: { from: ["title"], transform: "parseBedrooms" },
  bathrooms: { from: ["title"], transform: "parseBathrooms" },
  engagement: {
    likes: "likesCount",
    comments: "commentsCount",
    shares: "sharesCount",
  },
};

/**
 * The CEO's "main priority": buyers actively looking for Bali property.
 * Evaluated against the person-level rollup (`application/alerting/dispatch.ts`'s
 * `toSubject`), not any single appearance — `buyerScore`/`leadType` are rolled
 * up from everywhere a lead was seen, and `latestAppearanceAt` is when they were
 * last active anywhere, not one post's timestamp. There's no `isSpam` at the
 * person level: a spam appearance simply never contributes to `buyerScore`.
 */
const priorityBuyerPredicate = {
  all: [
    { field: "leadType", op: "eq", value: "buyer" },
    { field: "buyerScore", op: "gte", value: 60 },
    { field: "latestAppearanceAt", op: "within", value: "P3D" },
    {
      any: [
        {
          field: "propertyTypes",
          op: "intersects",
          value: ["villa", "land", "commercial", "hotel", "resort", "apartment", "house"],
        },
        { field: "budgetMin", op: "gte", value: 50000 },
      ],
    },
  ],
};

/** Wider net, lower urgency — a daily sweep so nothing genuinely good is missed. */
const anyBuyerPredicate = {
  all: [
    { field: "leadType", op: "eq", value: "buyer" },
    { field: "buyerScore", op: "gte", value: 35 },
    { field: "latestAppearanceAt", op: "within", value: "P1D" },
  ],
};

const LOCATION_ALIASES = [
  ["changgu", "canggu"],
  ["cangu", "canggu"],
  ["batu bolong", "canggu"],
  ["berawa", "canggu"],
  ["echo beach", "canggu"],
  ["umalas", "kerobokan"],
  ["denpasar, bali", "denpasar"],
  ["badung, bali", "badung"],
];

try {
  const [source] = await sql`
    INSERT INTO sources (kind, name, config, enabled)
    VALUES ('apify', 'Apify — Facebook & Instagram scrapers', ${sql.json({
      // Empty filters = track everything the token can see. Narrow this from the
      // admin UI once the useful producers are known.
      producerIds: [],
      namePatterns: [],
      minItemCount: 1,
    })}, true)
    ON CONFLICT (kind, name) DO UPDATE SET updated_at = now()
    RETURNING id, name
  `;
  console.log(`source: ${source.name} (${source.id})`);

  // Paths that identify a Facebook Groups payload. All must be present for this
  // profile to claim a dataset.
  const facebookMatchPaths = ["user.name", "groupTitle", "facebookUrl", "text"];

  const [profile] = await sql`
    INSERT INTO mapping_profiles (name, source_kind, record_kind, platform, version, rules, match_paths, passthrough, auto_generated, confidence, approved_at)
    VALUES ('apify/facebook-groups-scraper', 'apify', 'content_post', 'facebook', 1, ${sql.json(facebookRules)}, ${facebookMatchPaths}, true, false, 1.0, now())
    ON CONFLICT (name, version) DO UPDATE SET rules = EXCLUDED.rules, match_paths = EXCLUDED.match_paths, record_kind = EXCLUDED.record_kind, platform = EXCLUDED.platform, approved_at = now()
    RETURNING id, name
  `;
  console.log(`mapping profile: ${profile.name} (${profile.id})`);

  const recipients = (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const [priority] = await sql`
    INSERT INTO alert_rules (name, description, enabled, predicate, channels, recipients, throttle_seconds, digest_threshold, escalate_after_seconds)
    VALUES (
      'High-intent Bali buyer',
      'Buyers actively looking for Bali property in the last 3 days. This is the cohort the sales team should be contacting first.',
      true,
      ${sql.json(priorityBuyerPredicate)},
      ARRAY['email']::alert_channel[],
      ${recipients},
      300, 3, 1800
    )
    ON CONFLICT (name) DO UPDATE SET predicate = EXCLUDED.predicate, recipients = EXCLUDED.recipients
    RETURNING id, name
  `;
  console.log(`alert rule: ${priority.name}`);

  const [daily] = await sql`
    INSERT INTO alert_rules (name, description, enabled, predicate, channels, recipients, throttle_seconds, digest_threshold)
    VALUES (
      'Daily buyer sweep',
      'Lower-confidence buyer signals from the last 24 hours. Disabled by default until alert precision is measured.',
      false,
      ${sql.json(anyBuyerPredicate)},
      ARRAY['email']::alert_channel[],
      ${recipients},
      3600, 10
    )
    ON CONFLICT (name) DO UPDATE SET predicate = EXCLUDED.predicate
    RETURNING id, name
  `;
  console.log(`alert rule: ${daily.name} (disabled)`);

  for (const [alias, canonical] of LOCATION_ALIASES) {
    await sql`
      INSERT INTO location_aliases (alias, canonical, region)
      VALUES (${alias}, ${canonical}, 'Bali')
      ON CONFLICT (alias) DO UPDATE SET canonical = EXCLUDED.canonical
    `;
  }
  console.log(`location aliases: ${LOCATION_ALIASES.length}`);

  // Fallback FX so budgets are comparable across currencies before a live feed exists.
  for (const [currency, rate] of [
    ["USD", 1],
    ["IDR", 0.000061],
    ["EUR", 1.08],
    ["AUD", 0.66],
  ]) {
    await sql`
      INSERT INTO fx_rates (currency, usd_per_unit) VALUES (${currency}, ${rate})
      ON CONFLICT (currency) DO UPDATE SET usd_per_unit = EXCLUDED.usd_per_unit, updated_at = now()
    `;
  }
  console.log("fx rates seeded");
  console.log("\nseed complete");
} catch (error) {
  console.error("seed failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
