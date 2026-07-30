import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { ActionError } from "@/application/safe-action";
import { incrementApifyRequestUsage, isWithinMonthlyBudget } from "@/application/billing/usage";
import { getActorRunner } from "@/infrastructure/connectors/registry";
import { buildActorInput, paramsFingerprint, toScrapeRequestStatus } from "@/domain/collection/actor-request";
import { SCRAPE_REQUEST_DEDUP_WINDOW_MINUTES } from "@/shared/constants";
import { serverEnv } from "@/shared/config/env";
import type { ScrapeRequestRow } from "@/infrastructure/db/schema/collection";

const IN_FLIGHT_STATUSES = ["queued", "running", "succeeded"] as const;

export interface StartScrapeRequestInput {
  companyId: string;
  requestedByUserId: string;
  actorTemplateId: string;
  params: Record<string, unknown>;
}

/**
 * The orchestration behind "user selects source + requirements → system selects
 * the actor → sends parameters → Apify collects data," steps 1-4 of the
 * workflow. Storage/validation of *results* (steps 6-8) happens later, in
 * `completeScrapeRequest`, once the run finishes — this function's job ends at
 * "the run started (or was safely skipped)."
 *
 * Plain orchestration module, not a server action, per docs/coding-standards.md's
 * repository/service split — `scrape-requests.actions.ts` is the thin
 * auth-checked entry point that calls this; this is what integration tests
 * exercise directly, without needing a real session.
 */
export async function startScrapeRequest(
  input: StartScrapeRequestInput,
): Promise<ScrapeRequestRow & { reused: boolean }> {
  const [template] = await db()
    .select()
    .from(schema.actorTemplates)
    .where(eq(schema.actorTemplates.id, input.actorTemplateId))
    .limit(1);
  if (!template || !template.enabled) throw new ActionError("Actor template not found or disabled.");

  const built = buildActorInput(template, input.params);
  if (!built.ok) {
    throw new ActionError(`Missing required parameter(s): ${built.missing.join(", ")}`);
  }

  const fingerprint = paramsFingerprint(input.params);

  // Prevent unnecessary API usage: reuse a still-relevant identical request instead
  // of spending a second Apify run on a double-click or an impatient retry.
  const dedupSince = new Date(Date.now() - SCRAPE_REQUEST_DEDUP_WINDOW_MINUTES * 60_000);
  const [existing] = await db()
    .select()
    .from(schema.scrapeRequests)
    .where(
      and(
        eq(schema.scrapeRequests.companyId, input.companyId),
        eq(schema.scrapeRequests.actorTemplateId, template.id),
        eq(schema.scrapeRequests.paramsFingerprint, fingerprint),
        gte(schema.scrapeRequests.requestedAt, dedupSince),
        inArray(schema.scrapeRequests.status, IN_FLIGHT_STATUSES),
      ),
    )
    .orderBy(desc(schema.scrapeRequests.requestedAt))
    .limit(1);
  if (existing) return { ...existing, reused: true };

  // Budget check-and-reserve is atomic per company: a Postgres advisory lock
  // (released on commit) serializes concurrent `startScrapeRequest` calls for
  // the same company, and the reservation increment happens inside the same
  // short transaction as the check — closing the race where several
  // concurrently-fired requests (different params, so the dedup guard above
  // doesn't catch them) could all read "under budget" before any of them was
  // accounted for. Deliberately short and DB-only — the real Apify network
  // call happens after this commits, never while holding the lock/connection.
  // See `incrementApifyRequestUsage`'s comment for why this reservation and
  // the connector's own per-HTTP-call increment are additive, not a bug.
  const row = await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.companyId}))`);

    if (!(await isWithinMonthlyBudget(input.companyId, "apifyRequests", tx))) {
      throw new ActionError("Monthly Apify request budget reached for your plan. Upgrade to collect more data.");
    }
    await incrementApifyRequestUsage(input.companyId, tx);

    const [inserted] = await tx
      .insert(schema.scrapeRequests)
      .values({
        companyId: input.companyId,
        actorTemplateId: template.id,
        requestedByUserId: input.requestedByUserId,
        templateName: template.name,
        platform: template.platform,
        requirementKind: template.requirementKind,
        actorId: template.actorId,
        params: input.params,
        paramsFingerprint: fingerprint,
        status: "queued",
      })
      .returning();
    return inserted;
  });

  try {
    const run = await getActorRunner("apify").startRun(
      {
        actorId: template.actorId,
        input: built.input,
        webhookUrl: `${serverEnv().APP_URL}/api/webhooks/apify`,
      },
      { companyId: input.companyId },
    );

    const [updated] = await db()
      .update(schema.scrapeRequests)
      .set({
        status: toScrapeRequestStatus(run.status),
        apifyRunId: run.id,
        startedAt: run.startedAt,
      })
      .where(eq(schema.scrapeRequests.id, row.id))
      .returning();

    return { ...updated, reused: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db()
      .update(schema.scrapeRequests)
      .set({ status: "failed", errorSummary: message, finishedAt: new Date() })
      .where(eq(schema.scrapeRequests.id, row.id));

    // Handled failure, not a bug — surface it to the caller instead of a generic 500.
    throw new ActionError(`Failed to start scrape: ${message}`);
  }
}
