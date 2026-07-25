import {
  BALI_TIMEZONE,
  DATASET_FAILURE_THRESHOLD,
  DATASET_STALE_MULTIPLIER,
  MAX_SYNC_INTERVAL_SECONDS,
  MIN_SYNC_INTERVAL_SECONDS,
  WEEKEND_SYNC_MULTIPLIER,
} from "@/shared/constants";

/**
 * Adaptive polling.
 *
 * A fixed cron is wrong in both directions: it hammers datasets that never
 * change and under-polls the ones that do. Intervals therefore tighten when a
 * dataset produced new items and back off when it is quiet — and tighten again
 * at weekends, which is when consumers actually browse property.
 */

export function isWeekendInBali(now: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BALI_TIMEZONE,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  if (weekday === "Sat" || weekday === "Sun") return true;
  // Friday evening onwards counts as the weekend window.
  return weekday === "Fri" && hour >= 18;
}

export interface IntervalInput {
  baseIntervalSeconds: number;
  producedNewItems: boolean;
  consecutiveFailures: number;
  now?: Date;
}

export function nextIntervalSeconds({
  baseIntervalSeconds,
  producedNewItems,
  consecutiveFailures,
  now = new Date(),
}: IntervalInput): number {
  let interval = baseIntervalSeconds;

  if (producedNewItems) interval *= 0.5;
  else interval *= 1.5;

  if (isWeekendInBali(now)) interval *= WEEKEND_SYNC_MULTIPLIER;

  // Back off hard on repeated failure so a broken dataset cannot spend the
  // whole sync budget.
  if (consecutiveFailures > 0) interval *= 2 ** Math.min(consecutiveFailures, 5);

  return Math.round(
    Math.min(MAX_SYNC_INTERVAL_SECONDS, Math.max(MIN_SYNC_INTERVAL_SECONDS, interval)),
  );
}

export type DatasetHealth = "unknown" | "healthy" | "stale" | "degraded" | "schema_drift" | "error";

export interface HealthInput {
  consecutiveFailures: number;
  lastSyncedAt: Date | null;
  remoteModifiedAt: Date | null;
  syncIntervalSeconds: number;
  hasSchemaDrift: boolean;
  normalizationFailureRate: number;
  now?: Date;
}

export function computeHealth(input: HealthInput): { health: DatasetHealth; detail: string } {
  const now = input.now ?? new Date();

  if (input.consecutiveFailures >= DATASET_FAILURE_THRESHOLD) {
    return {
      health: "error",
      detail: `${input.consecutiveFailures} consecutive sync failures`,
    };
  }

  // Drift outranks staleness: the dataset is syncing fine, but its shape moved
  // and the mapping profile can no longer be trusted until a human looks.
  if (input.hasSchemaDrift) {
    return { health: "schema_drift", detail: "Upstream schema changed — mapping needs review" };
  }

  if (input.consecutiveFailures > 0) {
    return { health: "degraded", detail: `${input.consecutiveFailures} recent sync failure(s)` };
  }

  if (input.normalizationFailureRate > 0.05) {
    return {
      health: "degraded",
      detail: `${Math.round(input.normalizationFailureRate * 100)}% of records failed to normalize`,
    };
  }

  if (!input.lastSyncedAt) return { health: "unknown", detail: "Never synced" };

  const staleAfterMs = input.syncIntervalSeconds * DATASET_STALE_MULTIPLIER * 1000;
  const sourceAgeMs = input.remoteModifiedAt
    ? now.getTime() - input.remoteModifiedAt.getTime()
    : Number.POSITIVE_INFINITY;

  if (sourceAgeMs > staleAfterMs) {
    return {
      health: "stale",
      detail: "No new upstream items for more than 3 sync cycles",
    };
  }

  return { health: "healthy", detail: "Syncing normally" };
}
