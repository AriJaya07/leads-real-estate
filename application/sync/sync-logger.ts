import "server-only";
import { db, schema } from "@/infrastructure/db/client";
import { createLogger } from "@/infrastructure/observability/logger";

const fallbackLog = createLogger("sync-logger");

type Level = "debug" | "info" | "warn" | "error";

/**
 * Buffered structured logging for a sync run. Buffered because a chatty sync
 * would otherwise issue one INSERT per log line and spend more time logging
 * than ingesting.
 */
export class SyncLogger {
  private buffer: {
    companyId: string;
    syncRunId: string;
    level: Level;
    stage: string;
    message: string;
    context?: Record<string, unknown>;
  }[] = [];

  constructor(
    private readonly companyId: string,
    private readonly syncRunId: string,
  ) {}

  private push(level: Level, stage: string, message: string, context?: Record<string, unknown>) {
    this.buffer.push({ companyId: this.companyId, syncRunId: this.syncRunId, level, stage, message, context });
    if (this.buffer.length >= 50) void this.flush();
  }

  debug(stage: string, message: string, context?: Record<string, unknown>) {
    this.push("debug", stage, message, context);
  }
  info(stage: string, message: string, context?: Record<string, unknown>) {
    this.push("info", stage, message, context);
  }
  warn(stage: string, message: string, context?: Record<string, unknown>) {
    this.push("warn", stage, message, context);
  }
  error(stage: string, message: string, context?: Record<string, unknown>) {
    this.push("error", stage, message, context);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const rows = this.buffer;
    this.buffer = [];
    try {
      await db().insert(schema.syncEvents).values(rows);
    } catch (error) {
      // Losing a log line must never fail the sync that produced it.
      fallbackLog.error("failed to persist sync_events", { error, syncRunId: this.syncRunId });
    }
  }
}
