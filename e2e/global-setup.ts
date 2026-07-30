import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../infrastructure/db/schema";

/**
 * Seeds two companies directly via SQL before the e2e suite runs, entirely
 * independent of the app's own pipeline (no Apify call, no
 * `infrastructure/db/client.ts` or `infrastructure/auth/password.ts` import —
 * both start with `import "server-only"`, which throws unconditionally outside
 * Next's RSC build, so this file talks to Postgres directly instead).
 *
 * Two companies, not one: `e2e/multi-tenant.spec.ts` is the test that actually
 * proves the multi-tenant retrofit works — company A's admin must never see
 * company B's lead. Every other existing spec only needs company A.
 */

export const E2E_ADMIN_EMAIL = "e2e@dreamrue.test";
export const E2E_ADMIN_PASSWORD = "e2e-admin-password-123";
export const E2E_LEAD_AUTHOR = "E2E Test Buyer";

/**
 * Dedicated account for the throttling spec, kept separate from
 * E2E_ADMIN_EMAIL specifically so its own wrong-password test earlier in
 * login.spec.ts can't leave a failed attempt on the shared counter and throw
 * off the exact-5-attempts assertion in the throttling test.
 */
export const E2E_THROTTLE_EMAIL = "e2e-throttle@dreamrue.test";
export const E2E_THROTTLE_PASSWORD = "e2e-throttle-password-123";

/** Seeded with mustChangePassword=true, mirroring an admin-issued temporary password. */
export const E2E_TEMP_PASSWORD_EMAIL = "e2e-temp-password@dreamrue.test";
export const E2E_TEMP_PASSWORD_TEMP = "e2e-temporary-password-123";
export const E2E_TEMP_PASSWORD_NEW = "e2e-brand-new-password-456";

/** Dedicated account for the session-revocation spec, unshared for the same reason as E2E_THROTTLE_EMAIL. */
export const E2E_REVOCATION_EMAIL = "e2e-revocation@dreamrue.test";
export const E2E_REVOCATION_PASSWORD = "e2e-revocation-password-123";
export const E2E_REVOCATION_NEW_PASSWORD = "e2e-revocation-new-password-456";

/** A second, unrelated company — its admin and lead must be invisible to company A. */
export const E2E_OTHER_COMPANY_ADMIN_EMAIL = "e2e-other-company@dreamrue.test";
export const E2E_OTHER_COMPANY_ADMIN_PASSWORD = "e2e-other-company-password-123";
export const E2E_OTHER_COMPANY_LEAD_AUTHOR = "E2E Other Company Buyer";

// Mirrors infrastructure/auth/password.ts's format/params exactly, so the real
// `verifyPassword` (used by the login page under test) accepts this hash.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — copy .env.e2e.example to .env.e2e first.");
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes("e2e") && !dbName.includes("test")) {
    throw new Error(
      `Refusing to seed database "${dbName}" for e2e — its name must contain "e2e" or ` +
        `"test". Point .env.e2e's DATABASE_URL at a disposable database.`,
    );
  }

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  try {
    await sql`TRUNCATE TABLE
      lead_events, alert_deliveries, alert_rules, saved_views, lead_states,
      lead_appearances, leads, raw_records, sync_events, sync_runs,
      field_catalog, dataset_versions, datasets, mapping_profiles, sources,
      location_aliases, fx_rates, login_attempts, users, subscriptions, plans,
      companies
      RESTART IDENTITY CASCADE`;

    // `signup.spec.ts` exercises the real /signup flow, which now requires a
    // "Starter" plan to exist (`application/auth/signup.actions.ts`) — every
    // new company gets a real subscription from the moment it's created.
    await db.insert(schema.plans).values({
      name: "Starter",
      maxSeats: 3,
      maxDatasets: 3,
      maxRawRecordsPerMonth: 5_000,
      maxLeadsPerMonth: 1_000,
      maxAlertRules: 5,
      maxApifyRequestsPerMonth: 5_000,
      maxStorageKb: 500 * 1024,
      dataRetentionDays: 90,
    });

    const [companyA] = await db
      .insert(schema.companies)
      .values({ name: "E2E Company", slug: "e2e-company", status: "active" })
      .returning();
    const [companyB] = await db
      .insert(schema.companies)
      .values({ name: "E2E Other Company", slug: "e2e-other-company", status: "active" })
      .returning();

    // `billing.spec.ts` needs company A on a real plan with enough seats for
    // the 4 users seeded below, plus a smaller plan to prove a downgrade that
    // would exceed the target's seat limit is blocked.
    const [companyAPlan] = await db
      .insert(schema.plans)
      .values({
        name: "E2E Company Plan",
        monthlyPriceUsd: 149,
        maxSeats: 10,
        maxDatasets: 10,
        maxRawRecordsPerMonth: 25_000,
        maxLeadsPerMonth: 5_000,
        maxAlertRules: 25,
        maxApifyRequestsPerMonth: 25_000,
        maxStorageKb: 5 * 1024 * 1024,
        dataRetentionDays: 180,
      })
      .returning();
    await db.insert(schema.plans).values({
      name: "E2E Tiny Plan",
      monthlyPriceUsd: 10,
      maxSeats: 1,
      maxDatasets: 1,
      maxRawRecordsPerMonth: 100,
      maxLeadsPerMonth: 10,
      maxAlertRules: 1,
      maxApifyRequestsPerMonth: 100,
      maxStorageKb: 1_024,
      dataRetentionDays: 30,
    });
    await db.insert(schema.plans).values({
      name: "E2E Roomy Plan",
      monthlyPriceUsd: 399,
      maxSeats: 20,
      maxDatasets: 20,
      maxRawRecordsPerMonth: 100_000,
      maxLeadsPerMonth: 20_000,
      maxAlertRules: 100,
      maxApifyRequestsPerMonth: 100_000,
      maxStorageKb: 25 * 1024 * 1024,
      dataRetentionDays: 365,
    });
    await db.insert(schema.subscriptions).values({ companyId: companyA.id, planId: companyAPlan.id, status: "active" });

    await db.insert(schema.users).values([
      {
        companyId: companyA.id,
        email: E2E_ADMIN_EMAIL,
        name: "E2E Admin",
        role: "owner",
        passwordHash: await hashPassword(E2E_ADMIN_PASSWORD),
        passwordSetAt: new Date(),
      },
      {
        companyId: companyA.id,
        email: E2E_THROTTLE_EMAIL,
        name: "E2E Throttle Target",
        role: "member",
        passwordHash: await hashPassword(E2E_THROTTLE_PASSWORD),
        passwordSetAt: new Date(),
      },
      {
        companyId: companyA.id,
        email: E2E_TEMP_PASSWORD_EMAIL,
        name: "E2E Temp Password",
        role: "member",
        passwordHash: await hashPassword(E2E_TEMP_PASSWORD_TEMP),
        passwordSetAt: new Date(),
        mustChangePassword: true,
      },
      {
        companyId: companyA.id,
        email: E2E_REVOCATION_EMAIL,
        name: "E2E Revocation Target",
        role: "member",
        passwordHash: await hashPassword(E2E_REVOCATION_PASSWORD),
        passwordSetAt: new Date(),
      },
      {
        companyId: companyB.id,
        email: E2E_OTHER_COMPANY_ADMIN_EMAIL,
        name: "E2E Other Company Admin",
        role: "owner",
        passwordHash: await hashPassword(E2E_OTHER_COMPANY_ADMIN_PASSWORD),
        passwordSetAt: new Date(),
      },
    ]);

    /** One full lead (source → dataset → raw record → appearance → lead → state) per company. */
    async function seedLead(companyId: string, authorName: string, facebookId: string) {
      const [source] = await db
        .insert(schema.sources)
        .values({ companyId, kind: "apify", name: "e2e-source", config: {} })
        .returning();

      const [dataset] = await db
        .insert(schema.datasets)
        .values({ companyId, sourceId: source.id, externalId: `e2e-nonexistent-dataset-${facebookId}` })
        .returning();

      const [record] = await db
        .insert(schema.rawRecords)
        .values({
          companyId,
          datasetId: dataset.id,
          sourceItemId: `e2e-post-${facebookId}`,
          payload: {},
          contentHash: `e2e-hash-${facebookId}`,
          payloadHash: `e2e-payload-hash-${facebookId}`,
        })
        .returning();

      // A "lead" is a person now, not a post — seed the person row (with the
      // rollup fields a real ingest would compute) plus the one appearance it
      // came from, exactly mirroring `application/leads/process-records.ts`'s
      // shape without running the real pipeline (same reasoning as bypassing
      // `infrastructure/auth/password.ts` above).
      const [lead] = await db
        .insert(schema.leads)
        .values({
          companyId,
          facebookId,
          name: authorName,
          leadType: "buyer",
          buyerScore: 80,
          confidenceScore: 40,
          aiExplanation: "Classified as buyer from 1 appearance(s).",
          latestAppearanceAt: new Date(),
          appearanceCount: 1,
        })
        .returning();

      await db.insert(schema.leadAppearances).values({
        companyId,
        leadId: lead.id,
        rawRecordId: record.id,
        datasetId: dataset.id,
        externalId: `e2e-post-${facebookId}`,
        externalUrl: `https://example.com/e2e-post-${facebookId}`,
        authorName,
        authorExternalId: facebookId,
        body: "Looking to buy a villa in Canggu, budget around $300k",
        postedAt: new Date(),
        intent: "buyer",
        intentScore: 80,
        qualityScore: 40,
        isSpam: false,
      });

      await db.insert(schema.leadStates).values({ companyId, leadId: lead.id, status: "new" });
      return lead;
    }

    await seedLead(companyA.id, E2E_LEAD_AUTHOR, "e2e-fb-1");
    await seedLead(companyB.id, E2E_OTHER_COMPANY_LEAD_AUTHOR, "e2e-fb-2");
  } finally {
    await sql.end();
  }
}
