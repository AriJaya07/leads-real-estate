import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../infrastructure/db/schema";

/**
 * Seeds a fixed admin user + one buyer lead directly via SQL before the e2e
 * suite runs, entirely independent of the app's own pipeline (no Apify call, no
 * `infrastructure/db/client.ts` or `infrastructure/auth/password.ts` import —
 * both start with `import "server-only"`, which throws unconditionally outside
 * Next's RSC build, so this file talks to Postgres directly instead).
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
      lead_events, alert_deliveries, alert_rules, saved_views, lead_states, leads,
      raw_records, sync_events, sync_runs, field_catalog, dataset_versions,
      datasets, mapping_profiles, sources, location_aliases, fx_rates,
      login_attempts, users
      RESTART IDENTITY CASCADE`;

    await db.insert(schema.users).values([
      {
        email: E2E_ADMIN_EMAIL,
        name: "E2E Admin",
        role: "admin",
        passwordHash: await hashPassword(E2E_ADMIN_PASSWORD),
        passwordSetAt: new Date(),
      },
      {
        email: E2E_THROTTLE_EMAIL,
        name: "E2E Throttle Target",
        role: "agent",
        passwordHash: await hashPassword(E2E_THROTTLE_PASSWORD),
        passwordSetAt: new Date(),
      },
      {
        email: E2E_TEMP_PASSWORD_EMAIL,
        name: "E2E Temp Password",
        role: "agent",
        passwordHash: await hashPassword(E2E_TEMP_PASSWORD_TEMP),
        passwordSetAt: new Date(),
        mustChangePassword: true,
      },
      {
        email: E2E_REVOCATION_EMAIL,
        name: "E2E Revocation Target",
        role: "agent",
        passwordHash: await hashPassword(E2E_REVOCATION_PASSWORD),
        passwordSetAt: new Date(),
      },
    ]);

    const [source] = await db
      .insert(schema.sources)
      .values({ kind: "apify", name: "e2e-source", config: {} })
      .returning();

    const [dataset] = await db
      .insert(schema.datasets)
      .values({ sourceId: source.id, externalId: "e2e-nonexistent-dataset" })
      .returning();

    const [record] = await db
      .insert(schema.rawRecords)
      .values({
        datasetId: dataset.id,
        sourceItemId: "e2e-post-1",
        payload: {},
        contentHash: "e2e-hash",
        payloadHash: "e2e-payload-hash",
      })
      .returning();

    const [lead] = await db
      .insert(schema.leads)
      .values({
        rawRecordId: record.id,
        datasetId: dataset.id,
        externalId: "e2e-post-1",
        externalUrl: "https://example.com/e2e-post-1",
        authorName: E2E_LEAD_AUTHOR,
        body: "Looking to buy a villa in Canggu, budget around $300k",
        postedAt: new Date(),
        intent: "buyer",
        intentScore: 80,
        qualityScore: 40,
        isSpam: false,
      })
      .returning();

    await db.insert(schema.leadStates).values({ leadId: lead.id, status: "new" });
  } finally {
    await sql.end();
  }
}
