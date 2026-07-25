import "server-only";

/**
 * Structured logging, generalized from the shape `application/sync/sync-logger.ts`
 * already uses for sync runs (there, persisted to `sync_events` for the admin log
 * viewer). Everything *outside* the sync pipeline previously only reached
 * `console.error`/`console.warn` with no consistent shape — a production
 * incident in a server action or route handler was invisible unless someone was
 * tailing Vercel logs at the right moment. This doesn't fix that on its own, but
 * gives every log line a consistent `{ level, scope, message, ...fields, time }`
 * shape that a log processor (Vercel's, or anything downstream of it) can filter
 * and query on.
 *
 * Deliberately no new dependency: a JSON line over `console` is enough at this
 * scale. Reach for something like `pino` only if log volume or downstream
 * processing needs outgrow this.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/**
 * Optional hook for a managed error-tracking service (e.g. Sentry). Not wired to
 * anything by default — degrades exactly like `RESEND_API_KEY` does for email:
 * absent a reporter, `error()` just logs. Call `setErrorReporter` once at startup
 * (behind an env var check) if/when the team wants managed error tracking instead
 * of relying on log output alone.
 */
export interface ErrorReporter {
  captureException(error: unknown, context: LogFields): void;
}

let errorReporter: ErrorReporter | null = null;

export function setErrorReporter(reporter: ErrorReporter | null): void {
  errorReporter = reporter;
}

function emit(level: LogLevel, scope: string, message: string, fields?: LogFields): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    scope,
    message,
    ...fields,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  if (level === "error" && errorReporter) {
    const error = fields?.error;
    errorReporter.captureException(error ?? new Error(message), { scope, message, ...fields });
  }
}

/** One logger per module/subsystem — `scope` prefixes every line, replacing ad-hoc `[tag]` strings. */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, fields) => emit("debug", scope, message, fields),
    info: (message, fields) => emit("info", scope, message, fields),
    warn: (message, fields) => emit("warn", scope, message, fields),
    error: (message, fields) => emit("error", scope, message, fields),
  };
}
