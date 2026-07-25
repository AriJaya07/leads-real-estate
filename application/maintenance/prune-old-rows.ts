import "server-only";
import { lt } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { createLogger } from "@/infrastructure/observability/logger";
import { LOGIN_ATTEMPTS_RETENTION_DAYS, SYNC_EVENTS_RETENTION_DAYS } from "@/shared/constants";

const log = createLogger("retention");
const DAY_MS = 86_400_000;

export interface RetentionResult {
  syncEventsDeleted: number;
  loginAttemptsDeleted: number;
}

/**
 * Deletes rows past their retention window from the two tables nothing else
 * prunes (see the comment on the retention constants for why `sync_runs` and
 * `lead_events` are excluded). Run daily from `/api/cron/retention` — see
 * `docs/tech-debt.md`'s former "grows forever" entries for `login_attempts` and
 * the sync-events observability note in `docs/architecture.md`.
 */
export async function pruneOldRows(now: Date = new Date()): Promise<RetentionResult> {
  const syncEventsCutoff = new Date(now.getTime() - SYNC_EVENTS_RETENTION_DAYS * DAY_MS);
  const loginAttemptsCutoff = new Date(now.getTime() - LOGIN_ATTEMPTS_RETENTION_DAYS * DAY_MS);

  const deletedSyncEvents = await db()
    .delete(schema.syncEvents)
    .where(lt(schema.syncEvents.at, syncEventsCutoff))
    .returning({ id: schema.syncEvents.id });

  const deletedLoginAttempts = await db()
    .delete(schema.loginAttempts)
    .where(lt(schema.loginAttempts.createdAt, loginAttemptsCutoff))
    .returning({ id: schema.loginAttempts.id });

  const result: RetentionResult = {
    syncEventsDeleted: deletedSyncEvents.length,
    loginAttemptsDeleted: deletedLoginAttempts.length,
  };

  log.info("pruned old rows", { ...result });
  return result;
}
