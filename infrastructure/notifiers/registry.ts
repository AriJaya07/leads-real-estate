import "server-only";
import type { Notifier } from "@/domain/sync/ports";
import { emailNotifier } from "./email.notifier";
import { n8nNotifier } from "./n8n.notifier";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("notify");

/**
 * Channel registry. `whatsapp` and `slack` relay through n8n
 * (`infrastructure/notifiers/n8n.notifier.ts`) — n8n owns the WhatsApp Cloud
 * API token and Slack webhook, this repo only owns the shared secret that
 * authenticates the relay. `email` stays direct (Resend) because it's shared
 * with password-reset/invite sends, which must not depend on n8n being up.
 */
const notifiers = new Map<string, Notifier>([
  [emailNotifier.channel, emailNotifier],
  ["whatsapp", n8nNotifier("whatsapp")],
  ["slack", n8nNotifier("slack")],
]);

const nullNotifier: Notifier = {
  channel: "null",
  async send(message) {
    log.warn("no adapter for this channel; dropping message", { subject: message.subject });
    return { ok: false, error: "channel not implemented" };
  },
};

export function getNotifier(channel: string): Notifier {
  return notifiers.get(channel) ?? nullNotifier;
}
