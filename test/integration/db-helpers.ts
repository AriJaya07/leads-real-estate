import { db, schema } from "@/infrastructure/db/client";
import { sql } from "drizzle-orm";
import { SEED_CATEGORY_IDS } from "@/domain/verticals/seed-ids";

/**
 * Minimal identity data — enough to satisfy `companies.categoryId`'s FK, with
 * real per-category field labels (copied from
 * `infrastructure/db/backfill-categories.mjs`) since tests exercising the
 * signup/lead-inbox UI assert on them (e.g. real_estate's "Agency name").
 * Lexicon phrases stay unseeded on purpose — `getLexiconBundleForCategory`
 * falls back to `REAL_ESTATE_LEXICON` when a category has none, same as
 * production.
 */
const BASE_CATEGORIES = [
  {
    id: SEED_CATEGORY_IDS.real_estate,
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
    id: SEED_CATEGORY_IDS.travel,
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
    id: SEED_CATEGORY_IDS.courses,
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
    id: SEED_CATEGORY_IDS.other,
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

/**
 * Truncates every app table. Only ever call this against the disposable test
 * database — the database-name guard below is what stops a misconfigured
 * `DATABASE_URL` (e.g. someone's real `.env` sourced by accident) from wiping
 * dev or prod data when a test run starts.
 *
 * `categories` gets cascade-truncated along with `users` (it has an FK to
 * `users.id` via `createdByUserId`/`updatedByUserId`) even though it isn't
 * listed explicitly below — re-seeded immediately after so every test file
 * starts with `companies.categoryId`'s FK satisfiable, same four categories
 * `infrastructure/db/backfill-categories.mjs` seeds in real environments.
 */
export async function resetDb(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes("test")) {
    throw new Error(
      `resetDb() refuses to run against database "${dbName}" — its name must contain ` +
        `"test". Point DATABASE_URL at a disposable test database before running ` +
        `integration tests.`,
    );
  }

  await db().execute(sql`
    TRUNCATE TABLE
      ${schema.leadEvents},
      ${schema.alertDeliveries},
      ${schema.alertRules},
      ${schema.automationSettings},
      ${schema.savedViews},
      ${schema.leadTargetCompanyAffiliations},
      ${schema.targetCompanies},
      ${schema.leadStates},
      ${schema.leadAppearances},
      ${schema.leads},
      ${schema.apiRequests},
      ${schema.rawRecords},
      ${schema.syncEvents},
      ${schema.syncRuns},
      ${schema.fieldCatalog},
      ${schema.datasetVersions},
      ${schema.scrapeRequests},
      ${schema.datasets},
      ${schema.mappingProfiles},
      ${schema.actorTemplates},
      ${schema.sources},
      ${schema.locationAliases},
      ${schema.fxRates},
      ${schema.loginAttempts},
      ${schema.passwordResetTokens},
      ${schema.invites},
      ${schema.usageCounters},
      ${schema.teamMembers},
      ${schema.teams},
      ${schema.userRoles},
      ${schema.rolePermissions},
      ${schema.roles},
      ${schema.permissions},
      ${schema.profiles},
      ${schema.users},
      ${schema.subscriptions},
      ${schema.plans},
      ${schema.companies}
    RESTART IDENTITY CASCADE
  `);

  await db().insert(schema.categories).values(BASE_CATEGORIES).onConflictDoNothing({ target: schema.categories.id });
}
