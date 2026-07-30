import "server-only";
import type {
  ActorRun,
  ActorRunner,
  ActorRunStatus,
  ConnectorCallContext,
  RemoteDataset,
  RemoteItemPage,
  SourceConnector,
  StartActorRunInput,
} from "@/domain/sync/ports";
import { APIFY_API_BASE_URL } from "@/shared/constants";
import { serverEnv } from "@/shared/config/env";
import { db, schema } from "@/infrastructure/db/client";
import { incrementApifyRequestUsage } from "@/application/billing/usage";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("apify:api-requests");

class ApifyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

interface ApifyDatasetDto {
  id: string;
  name: string | null;
  title?: string | null;
  itemCount: number;
  createdAt: string;
  modifiedAt: string;
  actId?: string | null;
  actRunId?: string | null;
}

function toRemoteDataset(dto: ApifyDatasetDto): RemoteDataset {
  return {
    externalId: dto.id,
    name: dto.name ?? null,
    title: dto.title ?? null,
    itemCount: dto.itemCount ?? 0,
    createdAt: dto.createdAt ? new Date(dto.createdAt) : null,
    modifiedAt: dto.modifiedAt ? new Date(dto.modifiedAt) : null,
    producerId: dto.actId ?? null,
    producerRunId: dto.actRunId ?? null,
  };
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Fire-and-forget — a logging failure must never fail the real Apify
 * request, same rule every other adapter in this codebase follows.
 * Request-level telemetry, not business data: short retention expected, see
 * docs/tech-debt.md.
 */
function logApiRequest(
  context: ConnectorCallContext | undefined,
  fields: { endpoint: string; method: string; statusCode?: number; durationMs: number; error?: string },
): void {
  if (!context) return;
  db()
    .insert(schema.apiRequests)
    .values({
      companyId: context.companyId,
      endpoint: fields.endpoint,
      method: fields.method,
      statusCode: fields.statusCode ?? null,
      durationMs: fields.durationMs,
      error: fields.error ?? null,
    })
    .catch((error) => log.warn("failed to log api request", { error, endpoint: fields.endpoint }));

  // Billing-relevant count, separate from the audit-log row above — see
  // application/billing/usage.ts. Self-contained fire-and-forget, same as
  // the insert above.
  void incrementApifyRequestUsage(context.companyId);
}

/**
 * Native `fetch` rather than axios so requests participate in Next's
 * instrumentation, and so the platform carries one less dependency.
 */
async function apifyFetch(path: string, context?: ConnectorCallContext, attempt = 0): Promise<Response> {
  const startedAt = Date.now();
  const response = await fetch(`${APIFY_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${serverEnv().APIFY_API_TOKEN}` },
    // Sync results are persisted to Postgres; caching the upstream read would
    // only hide fresh items behind a stale response.
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const durationMs = Date.now() - startedAt;

  if (!response.ok && RETRYABLE.has(response.status) && attempt < 3) {
    logApiRequest(context, { endpoint: path, method: "GET", statusCode: response.status, durationMs });
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 2 ** attempt * 500;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return apifyFetch(path, context, attempt + 1);
  }

  if (!response.ok) {
    logApiRequest(context, {
      endpoint: path,
      method: "GET",
      statusCode: response.status,
      durationMs,
      error: `${response.status} ${response.statusText}`,
    });
    throw new ApifyError(
      `Apify request failed: ${response.status} ${response.statusText} (${path})`,
      response.status,
    );
  }

  logApiRequest(context, { endpoint: path, method: "GET", statusCode: response.status, durationMs });
  return response;
}

/** Apify's REST path uses `~` where the commonly-written slug uses `/` (`apify/instagram-scraper` → `apify~instagram-scraper`). */
function toActorPathId(actorId: string): string {
  return actorId.replace(/\//g, "~");
}

/**
 * Starts (or otherwise mutates) a run. Deliberately not retried the way `apifyFetch`
 * retries GETs — the Run Actor API isn't idempotent, so retrying a timed-out POST
 * risks starting the run twice and double-spending the actor's usage. A failed start
 * surfaces to the caller, which records it on the `scrape_requests` row and lets the
 * requester retry deliberately instead.
 */
async function apifyPost(path: string, body: Record<string, unknown>, context?: ConnectorCallContext): Promise<Response> {
  const startedAt = Date.now();
  const response = await fetch(`${APIFY_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv().APIFY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    logApiRequest(context, {
      endpoint: path,
      method: "POST",
      statusCode: response.status,
      durationMs,
      error: `${response.status} ${response.statusText}`,
    });
    throw new ApifyError(`Apify request failed: ${response.status} ${response.statusText} (${path})`, response.status);
  }

  logApiRequest(context, { endpoint: path, method: "POST", statusCode: response.status, durationMs });
  return response;
}

interface ApifyRunDto {
  id: string;
  actId: string;
  status: ActorRunStatus;
  defaultDatasetId?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  usageTotalUsd?: number | null;
}

function toActorRun(dto: ApifyRunDto): ActorRun {
  return {
    id: dto.id,
    actorId: dto.actId,
    status: dto.status,
    defaultDatasetId: dto.defaultDatasetId ?? null,
    startedAt: new Date(dto.startedAt),
    finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : null,
    usageUsd: typeof dto.usageTotalUsd === "number" ? dto.usageTotalUsd : null,
  };
}

/**
 * Registers our webhook against the run itself (rather than relying solely on an
 * account-level webhook already covering every actor) so a freshly-registered actor
 * template works immediately — no separate Apify Console step required.
 */
function encodeWebhooks(webhookUrl: string): string {
  return Buffer.from(
    JSON.stringify([
      {
        eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"],
        requestUrl: webhookUrl,
      },
    ]),
  ).toString("base64");
}

export const apifyActorRunner: ActorRunner = {
  async startRun(input: StartActorRunInput, context?: ConnectorCallContext): Promise<ActorRun> {
    const query = new URLSearchParams();
    if (input.webhookUrl) query.set("webhooks", encodeWebhooks(input.webhookUrl));
    const qs = query.toString();

    const response = await apifyPost(
      `/acts/${toActorPathId(input.actorId)}/runs${qs ? `?${qs}` : ""}`,
      input.input,
      context,
    );
    const body = (await response.json()) as { data: ApifyRunDto };
    return toActorRun(body.data);
  },

  async getRun(runId: string, context?: ConnectorCallContext): Promise<ActorRun | null> {
    try {
      const response = await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`, context);
      const body = (await response.json()) as { data: ApifyRunDto };
      return body.data ? toActorRun(body.data) : null;
    } catch (error) {
      if (error instanceof ApifyError && error.status === 404) return null;
      throw error;
    }
  },
};

export const apifyConnector: SourceConnector = {
  kind: "apify",

  /**
   * Apify's `/datasets` returns *only named* datasets by default. Unnamed
   * per-run datasets require `unnamed=1`, and both matter: named datasets are
   * the curated n8n targets, unnamed ones are individual actor run outputs.
   * Querying only the default would silently see a single dataset forever.
   */
  async listDatasets(context?: ConnectorCallContext): Promise<RemoteDataset[]> {
    const byId = new Map<string, RemoteDataset>();

    for (const unnamed of [false, true]) {
      let offset = 0;
      const limit = 100;

      for (;;) {
        const query = new URLSearchParams({
          desc: "1",
          limit: String(limit),
          offset: String(offset),
        });
        if (unnamed) query.set("unnamed", "1");

        const response = await apifyFetch(`/datasets?${query}`, context);
        const body = (await response.json()) as {
          data: { items: ApifyDatasetDto[]; total: number };
        };
        const items = body.data?.items ?? [];

        for (const item of items) byId.set(item.id, toRemoteDataset(item));

        offset += items.length;
        if (items.length < limit || offset >= (body.data?.total ?? 0)) break;
      }
    }

    return [...byId.values()];
  },

  async getDataset(externalId: string, context?: ConnectorCallContext): Promise<RemoteDataset | null> {
    try {
      const response = await apifyFetch(`/datasets/${encodeURIComponent(externalId)}`, context);
      const body = (await response.json()) as { data: ApifyDatasetDto };
      return body.data ? toRemoteDataset(body.data) : null;
    } catch (error) {
      if (error instanceof ApifyError && error.status === 404) return null;
      throw error;
    }
  },

  async fetchItems(
    externalId: string,
    offset: number,
    limit: number,
    context?: ConnectorCallContext,
  ): Promise<RemoteItemPage> {
    const query = new URLSearchParams({
      clean: "true",
      format: "json",
      offset: String(offset),
      limit: String(limit),
    });

    const response = await apifyFetch(
      `/datasets/${encodeURIComponent(externalId)}/items?${query}`,
      context,
    );

    // Apify's pagination total is `x-apify-pagination-total`. The commonly
    // assumed `x-total-count` is not sent and always reads as null.
    const totalHeader = response.headers.get("x-apify-pagination-total");
    const total = totalHeader === null ? null : Number(totalHeader);

    const items = (await response.json()) as unknown;

    return {
      items: Array.isArray(items) ? (items as Record<string, unknown>[]) : [],
      total: total !== null && Number.isFinite(total) ? total : null,
      offset,
      limit,
    };
  },
};
