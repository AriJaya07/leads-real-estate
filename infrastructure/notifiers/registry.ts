import "server-only";
import type { Notifier } from "@/domain/sync/ports";
import { emailNotifier } from "./email.notifier";
import { whatsappNotifier } from "./whatsapp.notifier";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("notify");

/**
 * Channel registry. Adding Slack is a new adapter registered here — the
 * alerting engine only knows the `Notifier` port.
 */
const notifiers = new Map<string, Notifier>([
  [emailNotifier.channel, emailNotifier],
  [whatsappNotifier.channel, whatsappNotifier],
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
