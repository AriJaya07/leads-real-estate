/**
 * Fixed UUIDs for the four categories that exist before any Super Admin has
 * created one — deterministic (not `defaultRandom()`) specifically so
 * `companies.categoryId`'s column default and the one-time backfill script
 * (`infrastructure/db/backfill-categories.mjs`) always agree on the same id
 * without a lookup. Never referenced after backfill except as the "other"
 * default for a company row that doesn't set a category explicitly — see
 * `infrastructure/db/schema/company.ts`.
 */
export const SEED_CATEGORY_IDS = {
  real_estate: "1daeab11-44b1-51b5-b13d-e40f02d76a3f",
  travel: "2c5f00d3-6824-5f39-902e-46da29869ee5",
  courses: "d10de773-4b91-5ee4-845e-2a130a96396c",
  other: "a92c5632-8cd4-5c4c-be0a-1a7169f875a9",
} as const;
