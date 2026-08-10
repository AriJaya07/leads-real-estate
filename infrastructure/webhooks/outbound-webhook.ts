import "server-only";
import { createHmac } from "node:crypto";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("webhook:outbound");
const TIMEOUT_MS = 8_000;

export interface OutboundWebhookPayload {
  event: string;
  companyId: string;
  timestamp: string;
  data: unknown;
}

export interface WebhookSendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * `X-AveronAi-Signature` = hex HMAC-SHA256 of the raw JSON body — how the
 * receiver verifies a request actually came from us and wasn't altered in
 * transit, same pattern Stripe/GitHub webhooks use. Exported on its own so
 * the admin UI's "test webhook" affordance and tests can compute the same
 * signature independently.
 */
export function signWebhookBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Single-attempt, best-effort delivery with a short timeout — a customer's
 * endpoint being down or slow must never affect lead processing or block a
 * server action. Same posture as `infrastructure/notifiers/*`: no retry
 * queue, no guaranteed delivery, errors are returned/logged, never thrown.
 */
export async function sendWebhook(
  url: string,
  secret: string | null,
  payload: OutboundWebhookPayload,
): Promise<WebhookSendResult> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-averonai-signature"] = signWebhookBody(secret, body);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `Webhook endpoint responded ${response.status}` };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("webhook delivery failed", { url, error: message });
    return { ok: false, error: message };
  }
}
