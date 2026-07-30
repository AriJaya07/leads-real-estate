/**
 * One-time data migration for the multi-tenant retrofit: creates a company for
 * pre-existing data and backfills every tenant table's `company_id` where
 * still NULL. Run once, after the "expand" migration (0001 — nullable
 * `company_id` columns) and before the "contract" migration (0002 — NOT
 * NULL) — see docs/saas-platform-architecture.md's Migration plan.
 *
 * Idempotent: finds-or-creates the company by slug, and only ever touches
 * rows where `company_id IS NULL`, so re-running once nothing is left to
 * backfill is a no-op.
 *
 * Usage: node --env-file=.env infrastructure/db/backfill-company.mjs ["Company Name"]
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const companyName = process.argv[2] ?? process.env.BACKFILL_COMPANY_NAME ?? "DreamRue";
const slug = companyName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

const sql = postgres(url, { max: 1 });

/** Every table with a (possibly still-NULL) `company_id` column as of this migration. */
const TENANT_TABLES = [
  "users",
  "sources",
  "datasets",
  "dataset_versions",
  "field_catalog",
  "raw_records",
  "sync_runs",
  "sync_events",
  "leads",
  "lead_appearances",
  "lead_states",
  "lead_events",
  "alert_rules",
  "alert_deliveries",
  "saved_views",
];

try {
  const [company] = await sql`
    INSERT INTO companies (name, slug, status)
    VALUES (${companyName}, ${slug}, 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name
  `;
  console.log(`company: ${company.name} (${company.id})`);

  for (const table of TENANT_TABLES) {
    const result = await sql`
      UPDATE ${sql(table)} SET company_id = ${company.id} WHERE company_id IS NULL
    `;
    if (result.count > 0) console.log(`  ${table}: backfilled ${result.count} row(s)`);
  }

  // Every company gets a subscription row so admin/billing UI has something
  // to read, even though billing integration itself is a deferred phase (see
  // docs/saas-platform-architecture.md's Phase 5) — "Legacy" is a permissive
  // placeholder plan for pre-existing data, not a real pricing tier.
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
  console.log(`subscription: ${company.name} on plan ${plan.id}`);

  console.log("\nbackfill complete");
} catch (error) {
  console.error("backfill failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
