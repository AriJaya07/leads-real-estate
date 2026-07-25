import "server-only";
import type { RemoteDataset, RemoteItemPage, SourceConnector } from "@/domain/sync/ports";
import { APIFY_API_BASE_URL } from "@/shared/constants";
import { serverEnv } from "@/shared/config/env";

export class ApifyError extends Error {
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
 * Native `fetch` rather than axios so requests participate in Next's
 * instrumentation, and so the platform carries one less dependency.
 */
async function apifyFetch(path: string, attempt = 0): Promise<Response> {
  const response = await fetch(`${APIFY_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${serverEnv().APIFY_API_TOKEN}` },
    // Sync results are persisted to Postgres; caching the upstream read would
    // only hide fresh items behind a stale response.
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok && RETRYABLE.has(response.status) && attempt < 3) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 2 ** attempt * 500;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return apifyFetch(path, attempt + 1);
  }

  if (!response.ok) {
    throw new ApifyError(
      `Apify request failed: ${response.status} ${response.statusText} (${path})`,
      response.status,
    );
  }

  return response;
}

export const apifyConnector: SourceConnector = {
  kind: "apify",

  /**
   * Apify's `/datasets` returns *only named* datasets by default. Unnamed
   * per-run datasets require `unnamed=1`, and both matter: named datasets are
   * the curated n8n targets, unnamed ones are individual actor run outputs.
   * Querying only the default would silently see a single dataset forever.
   */
  async listDatasets(): Promise<RemoteDataset[]> {
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

        const response = await apifyFetch(`/datasets?${query}`);
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

  async getDataset(externalId: string): Promise<RemoteDataset | null> {
    try {
      const response = await apifyFetch(`/datasets/${encodeURIComponent(externalId)}`);
      const body = (await response.json()) as { data: ApifyDatasetDto };
      return body.data ? toRemoteDataset(body.data) : null;
    } catch (error) {
      if (error instanceof ApifyError && error.status === 404) return null;
      throw error;
    }
  },

  async fetchItems(externalId: string, offset: number, limit: number): Promise<RemoteItemPage> {
    const query = new URLSearchParams({
      clean: "true",
      format: "json",
      offset: String(offset),
      limit: String(limit),
    });

    const response = await apifyFetch(
      `/datasets/${encodeURIComponent(externalId)}/items?${query}`,
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
