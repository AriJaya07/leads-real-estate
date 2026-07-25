import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, setErrorReporter } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
  setErrorReporter(null);
});

describe("createLogger", () => {
  it("routes error() to console.error as a single structured JSON line", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger("test-scope");

    log.error("something broke", { datasetId: "abc" });

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({
      level: "error",
      scope: "test-scope",
      message: "something broke",
      datasetId: "abc",
    });
    expect(typeof parsed.time).toBe("string");
  });

  it("routes warn() to console.warn and info()/debug() to console.log", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger("test-scope");

    log.warn("heads up");
    log.info("fyi");
    log.debug("verbose");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it("never calls the error reporter for non-error levels", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const captureException = vi.fn();
    setErrorReporter({ captureException });

    createLogger("test-scope").warn("not an error");

    expect(captureException).not.toHaveBeenCalled();
  });

  it("forwards to the error reporter, when set, only on error()", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const captureException = vi.fn();
    setErrorReporter({ captureException });

    const cause = new Error("boom");
    createLogger("test-scope").error("failed", { error: cause, leadId: "1" });

    expect(captureException).toHaveBeenCalledWith(
      cause,
      expect.objectContaining({ scope: "test-scope", message: "failed", leadId: "1" }),
    );
  });

  it("degrades to logging only when no error reporter is configured", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    createLogger("test-scope").error("failed");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
