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

export interface SourceConnector {
  readonly kind: string;
  /** Enumerate every dataset the credentials can see, named and unnamed alike. */
  listDatasets(): Promise<RemoteDataset[]>;
  getDataset(externalId: string): Promise<RemoteDataset | null>;
  fetchItems(externalId: string, offset: number, limit: number): Promise<RemoteItemPage>;
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
