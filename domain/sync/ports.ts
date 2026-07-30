/**
 * Ports the ingestion pipeline talks to. Implemented in `infrastructure/`.
 *
 * The whole reason this abstraction exists: the business must not be
 * existentially coupled to one scraping vendor. Adding a portal feed, an
 * inbound WhatsApp webhook or a website form is a new adapter, not a rewrite.
 */

export interface RemoteDataset {
  externalId: string;
  name: string | null;
  title: string | null;
  itemCount: number;
  createdAt: Date | null;
  modifiedAt: Date | null;
  producerId: string | null;
  producerRunId: string | null;
}

export interface RemoteItemPage {
  items: Record<string, unknown>[];
  /** Authoritative upstream total. Apify sends `x-apify-pagination-total`. */
  total: number | null;
  offset: number;
  limit: number;
}

/**
 * Optional, additive — an adapter that logs request-level telemetry (see
 * `infrastructure/apify/apify.connector.ts`) uses it; one that doesn't can
 * ignore it entirely. Callers already have `companyId` in scope wherever
 * these methods are invoked (the dataset/source row just loaded).
 */
export interface ConnectorCallContext {
  companyId: string;
}

export interface SourceConnector {
  readonly kind: string;
  /** Enumerate every dataset the credentials can see, named and unnamed alike. */
  listDatasets(context?: ConnectorCallContext): Promise<RemoteDataset[]>;
  getDataset(externalId: string, context?: ConnectorCallContext): Promise<RemoteDataset | null>;
  fetchItems(
    externalId: string,
    offset: number,
    limit: number,
    context?: ConnectorCallContext,
  ): Promise<RemoteItemPage>;
}

/**
 * Triggers a fresh scrape rather than reading one that already exists —
 * a different capability from `SourceConnector` above (which only ever reads
 * datasets someone/something else produced). Optional per adapter: only
 * `infrastructure/apify/apify.connector.ts` implements it today.
 */
export interface StartActorRunInput {
  actorId: string;
  input: Record<string, unknown>;
  /** Absolute URL Apify calls back on run completion/failure. */
  webhookUrl?: string;
}

export type ActorRunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "ABORTED"
  | "TIMED-OUT"
  | "TIMING-OUT"
  | "ABORTING";

export interface ActorRun {
  id: string;
  actorId: string;
  status: ActorRunStatus;
  defaultDatasetId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  /** USD, when the upstream API reports it — best-effort, used for cost monitoring only. */
  usageUsd: number | null;
}

export interface ActorRunner {
  startRun(input: StartActorRunInput, context?: ConnectorCallContext): Promise<ActorRun>;
  getRun(runId: string, context?: ConnectorCallContext): Promise<ActorRun | null>;
}

export interface Notifier {
  readonly channel: string;
  send(message: NotificationMessage): Promise<{ ok: boolean; error?: string }>;
}

export interface NotificationMessage {
  to: string;
  subject: string;
  html?: string;
  text: string;
}
