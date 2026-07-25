import "server-only";
import type { SourceConnector } from "@/domain/sync/ports";
import { apifyConnector } from "@/infrastructure/apify/apify.connector";

/**
 * Connector registry. Adding a portal feed, an inbound WhatsApp webhook or a
 * website form means registering another adapter here — the sync engine only
 * knows the `SourceConnector` port, never a vendor.
 */
const connectors = new Map<string, SourceConnector>([[apifyConnector.kind, apifyConnector]]);

export function getConnector(kind: string): SourceConnector {
  const connector = connectors.get(kind);
  if (!connector) throw new Error(`No connector registered for source kind "${kind}"`);
  return connector;
}

export function connectorKinds(): string[] {
  return [...connectors.keys()];
}

/**
 * Registers an adapter under a source kind, overwriting any existing one for that
 * kind. Exists for two reasons: a real new connector wiring itself in at startup,
 * and integration tests exercising the sync engine against a fake connector
 * (registered under the "manual" kind, which is never used by a real adapter)
 * instead of making network calls.
 */
export function registerConnector(connector: SourceConnector): void {
  connectors.set(connector.kind, connector);
}
