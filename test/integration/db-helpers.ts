import { db, schema } from "@/infrastructure/db/client";
import { sql } from "drizzle-orm";

/**
 * Truncates every app table. Only ever call this against the disposable test
 * database — the database-name guard below is what stops a misconfigured
 * `DATABASE_URL` (e.g. someone's real `.env` sourced by accident) from wiping
 * dev or prod data when a test run starts.
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
}
