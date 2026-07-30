import "server-only";
import type { ActorRunner, SourceConnector } from "@/domain/sync/ports";
import { apifyActorRunner, apifyConnector } from "@/infrastructure/apify/apify.connector";

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

/**
 * Same registry/swap pattern as `SourceConnector` above, for the run-triggering
 * capability instead of the read-only one — keyed by connector kind so a future
 * non-Apify actor runner slots in the same way. Lets integration tests substitute
 * a fake runner (`registerActorRunner("apify", fake)`) instead of hitting the
 * real Apify API from `application/collection/scrape-requests.actions.ts`.
 */
const actorRunners = new Map<string, ActorRunner>([["apify", apifyActorRunner]]);

export function getActorRunner(kind: string): ActorRunner {
  const runner = actorRunners.get(kind);
  if (!runner) throw new Error(`No actor runner registered for source kind "${kind}"`);
  return runner;
}

export function registerActorRunner(kind: string, runner: ActorRunner): void {
  actorRunners.set(kind, runner);
}
