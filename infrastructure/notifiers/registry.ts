import "server-only";
import type { Notifier } from "@/domain/sync/ports";
import { emailNotifier } from "./email.notifier";

/**
 * Channel registry. Adding WhatsApp / Slack is a new adapter registered here —
 * the alerting engine only knows the `Notifier` port.
 */
const notifiers = new Map<string, Notifier>([[emailNotifier.channel, emailNotifier]]);

const nullNotifier: Notifier = {
  channel: "null",
  async send(message) {
    console.warn(`[notify] no adapter for this channel; dropped "${message.subject}"`);
    return { ok: false, error: "channel not implemented" };
  },
};

export function getNotifier(channel: string): Notifier {
  return notifiers.get(channel) ?? nullNotifier;
}

export function availableChannels(): string[] {
  return [...notifiers.keys()];
}
