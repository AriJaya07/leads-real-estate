/**
 * Seeds the baseline configuration that used to live in environment variables:
 * the Apify source, a known-good mapping profile for the Facebook Groups actor,
 * the CEO's priority alert rule, and location aliases — for one company,
 * given by name (default "AveronAi", matching the pre-multi-tenant instance).
 * `mapping_profiles`/`location_aliases`/`fx_rates` stay global — see
 * docs/saas-platform-architecture.md.
 *
 * Idempotent — safe to re-run.
 *
 * Usage: node --env-file=.env infrastructure/db/seed.mjs ["Company Name"]
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const companyName = process.argv[2] ?? process.env.SEED_COMPANY_NAME ?? "AveronAi";
const companySlug = companyName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

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
  const [company] = await sql`
    INSERT INTO companies (name, slug, category, status)
    VALUES (${companyName}, ${companySlug}, 'real_estate', 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category
    RETURNING id, name
  `;
  console.log(`company: ${company.name} (${company.id})`);

  // The real, sellable tiers — see docs/pricing-strategy.md for the business
  // rationale behind every number here. `maxSeats`/`maxAlertRules: null` means
  // unlimited (Enterprise's actual selling point for those two); every other
  // limit stays finite even for Enterprise since it maps to real infra/API
  // cost (Apify requests, storage, records fetched).
  const STANDARD_PLANS = [
    {
      name: "Starter",
      monthlyPriceUsd: 49,
      annualPriceUsd: 470, // ~20% off, matches every tier below
      maxSeats: 3,
      maxDatasets: 3,
      maxRawRecordsPerMonth: 5_000,
      maxLeadsPerMonth: 1_000,
      maxAlertRules: 5,
      maxApifyRequestsPerMonth: 5_000,
      maxStorageKb: 500 * 1024,
      dataRetentionDays: 90,
      apiRateLimitPerMinute: 20,
      apiRateLimitBurst: 40,
      features: {
        whatsappAlerts: false,
        llmShadowClassify: false,
        aiAssistant: false,
        customBranding: false,
        prioritySupport: false,
        sso: false,
      },
    },
    {
      name: "Professional",
      monthlyPriceUsd: 149,
      annualPriceUsd: 1_430,
      maxSeats: 10,
      maxDatasets: 10,
      maxRawRecordsPerMonth: 25_000,
      maxLeadsPerMonth: 5_000,
      maxAlertRules: 25,
      maxApifyRequestsPerMonth: 25_000,
      maxStorageKb: 5 * 1024 * 1024,
      dataRetentionDays: 180,
      apiRateLimitPerMinute: 60,
      apiRateLimitBurst: 120,
      features: {
        whatsappAlerts: true,
        llmShadowClassify: false,
        aiAssistant: false,
        customBranding: false,
        prioritySupport: true,
        sso: false,
      },
    },
    {
      name: "Business",
      monthlyPriceUsd: 399,
      annualPriceUsd: 3_830,
      maxSeats: 25,
      maxDatasets: 30,
      maxRawRecordsPerMonth: 100_000,
      maxLeadsPerMonth: 20_000,
      maxAlertRules: 100,
      maxApifyRequestsPerMonth: 100_000,
      maxStorageKb: 25 * 1024 * 1024,
      dataRetentionDays: 365,
      apiRateLimitPerMinute: 180,
      apiRateLimitBurst: 360,
      features: {
        whatsappAlerts: true,
        llmShadowClassify: true,
        aiAssistant: true,
        customBranding: true,
        prioritySupport: true,
        sso: false,
      },
    },
    {
      name: "Enterprise",
      // Indicative "starting at" price, not a fixed self-serve rate — real
      // Enterprise deals are custom-quoted. No annual self-serve option.
      monthlyPriceUsd: 999,
      annualPriceUsd: null,
      maxSeats: null,
      maxDatasets: 100,
      maxRawRecordsPerMonth: 500_000,
      maxLeadsPerMonth: 100_000,
      maxAlertRules: null,
      maxApifyRequestsPerMonth: 500_000,
      maxStorageKb: 100 * 1024 * 1024,
      dataRetentionDays: 730,
      apiRateLimitPerMinute: null,
      apiRateLimitBurst: null,
      features: {
        whatsappAlerts: true,
        llmShadowClassify: true,
        aiAssistant: true,
        customBranding: true,
        prioritySupport: true,
        sso: true,
      },
    },
  ];

  for (const p of STANDARD_PLANS) {
    const [existing] = await sql`SELECT id FROM plans WHERE name = ${p.name} LIMIT 1`;
    if (existing) continue;
    await sql`
      INSERT INTO plans (
        name, monthly_price_usd, annual_price_usd, max_seats, max_datasets,
        max_raw_records_per_month, max_leads_per_month, max_alert_rules,
        max_apify_requests_per_month, max_storage_kb, data_retention_days, features,
        api_rate_limit_per_minute, api_rate_limit_burst
      )
      VALUES (
        ${p.name}, ${p.monthlyPriceUsd}, ${p.annualPriceUsd}, ${p.maxSeats}, ${p.maxDatasets},
        ${p.maxRawRecordsPerMonth}, ${p.maxLeadsPerMonth}, ${p.maxAlertRules},
        ${p.maxApifyRequestsPerMonth}, ${p.maxStorageKb}, ${p.dataRetentionDays},
        ${sql.json(p.features)}, ${p.apiRateLimitPerMinute}, ${p.apiRateLimitBurst}
      )
    `;
  }
  console.log(`standard plans: ${STANDARD_PLANS.map((p) => p.name).join(", ")}`);

  // Permissive catch-all for any company that predates the standard tiers
  // above (e.g. backfilled from a pre-multi-tenant instance) — see
  // infrastructure/db/backfill-company.mjs. Not sellable, never assigned to a
  // new signup (application/auth/signup.actions.ts always uses "Starter").
  let [plan] = await sql`SELECT id FROM plans WHERE name = 'Legacy' LIMIT 1`;
  if (!plan) {
    [plan] = await sql`
      INSERT INTO plans (
        name, max_seats, max_datasets, max_raw_records_per_month, max_leads_per_month,
        max_alert_rules, max_apify_requests_per_month, max_storage_kb, data_retention_days
      )
      VALUES ('Legacy', 999, 999, 999999, 999999, 999, 999999, 999999999, 3650)
      RETURNING id
    `;
  }
  await sql`
    INSERT INTO subscriptions (company_id, plan_id, status)
    VALUES (${company.id}, ${plan.id}, 'active')
    ON CONFLICT (company_id) DO NOTHING
  `;

  // One shared Apify account serves every company in this platform — the
  // namePatterns prefix is what stops two companies' sources both claiming
  // the same upstream dataset. See domain/dataset/tenant-naming.ts (this is
  // a plain .mjs script with no build step, so the prefix format is
  // duplicated here rather than imported — keep the two in sync by hand if
  // the convention ever changes) and docs/multi-tenant-apify-isolation-plan.md.
  const tenantDatasetPrefix = `averonai-${companySlug}-`;

  const [source] = await sql`
    INSERT INTO sources (company_id, kind, name, config, enabled)
    VALUES (${company.id}, 'apify', 'Apify — Facebook & Instagram scrapers', ${sql.json({
      producerIds: [],
      namePatterns: [tenantDatasetPrefix],
      minItemCount: 1,
    })}, true)
    ON CONFLICT (company_id, kind, name) DO UPDATE SET updated_at = now()
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

  // Starter actor templates, one per category — demonstrates the
  // category-tagging mechanism (features/collection/components/request-scrape-form.tsx's
  // "Recommended for your category" sort) with real rows instead of an empty
  // admin screen. `category: null` (the Facebook Groups one) means "useful
  // for every category" — the same actor a travel or courses tenant would
  // also point at a relevant Facebook group. The travel/courses actor ids
  // below are placeholders — replace with real Apify Store actors before
  // relying on them.
  const actorTemplates = [
    {
      name: "Facebook Groups Scraper",
      platform: "facebook",
      category: null,
      requirementKind: "group_posts",
      description: "Posts from a public Facebook Group — the general-purpose social-listening source for any category.",
      actorId: "apify/facebook-groups-scraper",
      defaultInput: { resultsLimit: 100 },
      requiredParams: ["startUrls"],
      costNote: "~$2 per 1,000 posts",
    },
    {
      name: "Property Portal Listings (example)",
      platform: "other",
      category: "real_estate",
      requirementKind: "listing_search",
      description: "Example placeholder — replace actorId with a real Apify Store property-portal scraper before use.",
      actorId: "REPLACE_WITH_REAL_ACTOR_ID",
      defaultInput: {},
      requiredParams: ["searchUrl"],
      costNote: null,
    },
    {
      name: "Travel Forum/OTA Listings (example)",
      platform: "other",
      category: "travel",
      requirementKind: "listing_search",
      description: "Example placeholder — replace actorId with a real Apify Store travel/OTA scraper before use.",
      actorId: "REPLACE_WITH_REAL_ACTOR_ID",
      defaultInput: {},
      requiredParams: ["searchUrl"],
      costNote: null,
    },
    {
      name: "Course Provider Listings (example)",
      platform: "other",
      category: "courses",
      requirementKind: "listing_search",
      description: "Example placeholder — replace actorId with a real Apify Store course-provider scraper before use.",
      actorId: "REPLACE_WITH_REAL_ACTOR_ID",
      defaultInput: {},
      requiredParams: ["searchUrl"],
      costNote: null,
    },
  ];

  for (const t of actorTemplates) {
    await sql`
      INSERT INTO actor_templates (name, platform, category, requirement_kind, description, actor_id, default_input, required_params, cost_note)
      VALUES (${t.name}, ${t.platform}, ${t.category}, ${t.requirementKind}, ${t.description}, ${t.actorId}, ${sql.json(t.defaultInput)}, ${t.requiredParams}, ${t.costNote})
      ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, description = EXCLUDED.description
    `;
  }
  console.log(`actor templates: ${actorTemplates.length} seeded`);

  const recipients = (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const [priority] = await sql`
    INSERT INTO alert_rules (company_id, name, description, enabled, predicate, channels, recipients, throttle_seconds, digest_threshold, escalate_after_seconds)
    VALUES (
      ${company.id},
      'High-intent Bali buyer',
      'Buyers actively looking for Bali property in the last 3 days. This is the cohort the sales team should be contacting first.',
      true,
      ${sql.json(priorityBuyerPredicate)},
      ARRAY['email']::alert_channel[],
      ${recipients},
      300, 3, 1800
    )
    ON CONFLICT (company_id, name) DO UPDATE SET predicate = EXCLUDED.predicate, recipients = EXCLUDED.recipients
    RETURNING id, name
  `;
  console.log(`alert rule: ${priority.name}`);

  const [daily] = await sql`
    INSERT INTO alert_rules (company_id, name, description, enabled, predicate, channels, recipients, throttle_seconds, digest_threshold)
    VALUES (
      ${company.id},
      'Daily buyer sweep',
      'Lower-confidence buyer signals from the last 24 hours. Disabled by default until alert precision is measured.',
      false,
      ${sql.json(anyBuyerPredicate)},
      ARRAY['email']::alert_channel[],
      ${recipients},
      3600, 10
    )
    ON CONFLICT (company_id, name) DO UPDATE SET predicate = EXCLUDED.predicate
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

  // Schema-only extension point, not enforced anywhere yet — `users.role`
  // stays the fast-path check every existing action/page guard uses. This
  // catalog just gives the tables real reference data instead of being
  // completely empty. See docs/saas-database-schema.md.
  const PERMISSIONS = [
    ["leads", "read"],
    ["leads", "write"],
    ["datasets", "read"],
    ["datasets", "manage"],
    ["team", "manage"],
    ["billing", "manage"],
  ];
  for (const [resource, action] of PERMISSIONS) {
    await sql`
      INSERT INTO permissions (resource, action)
      VALUES (${resource}, ${action})
      ON CONFLICT (resource, action) DO NOTHING
    `;
  }
  console.log(`permissions catalog: ${PERMISSIONS.length}`);

  // company_id IS NULL = a system role, shared across every company.
  // Matches the partial index's own WHERE clause exactly
  // (roles_system_name_key) — Postgres can't infer a partial index from a
  // bare column list when more than one partial index exists on it.
  for (const name of ["owner", "admin", "manager", "member"]) {
    await sql`
      INSERT INTO roles (company_id, name, is_system)
      VALUES (NULL, ${name}, true)
      ON CONFLICT (name) WHERE company_id IS NULL DO NOTHING
    `;
  }
  console.log("system roles: owner, admin, manager, member");

  console.log("\nseed complete");
} catch (error) {
  console.error("seed failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
