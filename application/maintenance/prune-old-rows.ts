import "server-only";
import { lt } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { createLogger } from "@/infrastructure/observability/logger";
import {
  API_KEY_RATE_COUNTER_RETENTION_HOURS,
  LOGIN_ATTEMPTS_RETENTION_DAYS,
  SYNC_EVENTS_RETENTION_DAYS,
} from "@/shared/constants";

const log = createLogger("retention");
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface RetentionResult {
  syncEventsDeleted: number;
  loginAttemptsDeleted: number;
  apiKeyRateCountersDeleted: number;
}

/**
 * Deletes rows past their retention window from the two tables nothing else
 * prunes (see the comment on the retention constants for why `sync_runs` and
 * `lead_events` are excluded).
 *
 * Nothing calls this today: it used to run from `/api/cron/retention`, removed
 * along with the rest of the cron routes in favour of external (n8n)
 * scheduling. It stays because the retention need it addresses is real — see
 * `docs/tech-debt.md`'s "no scheduled trigger" entry.
 */
export async function pruneOldRows(now: Date = new Date()): Promise<RetentionResult> {
  const syncEventsCutoff = new Date(now.getTime() - SYNC_EVENTS_RETENTION_DAYS * DAY_MS);
  const loginAttemptsCutoff = new Date(now.getTime() - LOGIN_ATTEMPTS_RETENTION_DAYS * DAY_MS);
  const apiKeyRateCountersCutoff = new Date(now.getTime() - API_KEY_RATE_COUNTER_RETENTION_HOURS * HOUR_MS);

  const deletedSyncEvents = await db()
    .delete(schema.syncEvents)
    .where(lt(schema.syncEvents.at, syncEventsCutoff))
    .returning({ id: schema.syncEvents.id });

  const deletedLoginAttempts = await db()
    .delete(schema.loginAttempts)
    .where(lt(schema.loginAttempts.createdAt, loginAttemptsCutoff))
    .returning({ id: schema.loginAttempts.id });

  const deletedApiKeyRateCounters = await db()
    .delete(schema.apiKeyRateCounters)
    .where(lt(schema.apiKeyRateCounters.windowStart, apiKeyRateCountersCutoff))
    .returning({ apiKeyId: schema.apiKeyRateCounters.apiKeyId });

  const result: RetentionResult = {
    syncEventsDeleted: deletedSyncEvents.length,
    loginAttemptsDeleted: deletedLoginAttempts.length,
    apiKeyRateCountersDeleted: deletedApiKeyRateCounters.length,
  };

  log.info("pruned old rows", { ...result });
  return result;
}
