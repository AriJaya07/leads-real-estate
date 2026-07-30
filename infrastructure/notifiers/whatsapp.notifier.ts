import "server-only";
import type { NotificationMessage, Notifier } from "@/domain/sync/ports";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("notify:whatsapp");

interface WhatsappConfig {
  token: string;
  phoneNumberId: string;
}

let config: WhatsappConfig | null | undefined;

function whatsappConfig(): WhatsappConfig | null {
  if (config !== undefined) return config;
  const token = serverEnv().WHATSAPP_API_TOKEN;
  const phoneNumberId = serverEnv().WHATSAPP_PHONE_NUMBER_ID;
  config = token && phoneNumberId ? { token, phoneNumberId } : null;
  return config;
}

/**
 * WhatsApp Cloud API channel. Degrades to a log line when unconfigured rather
 * than throwing — same "must never break ingestion" rule as the email
 * notifier. WhatsApp has no subject line, so `message.subject`/`message.text`
 * are flattened into one text body here rather than pushing that concern onto
 * `dispatch.ts`/`digest-template.ts`, which stay channel-agnostic.
 */
export const whatsappNotifier: Notifier = {
  channel: "whatsapp",
  async send(message: NotificationMessage) {
    const cfg = whatsappConfig();
    if (!cfg) {
      log.warn("not configured; dropping message", { subject: message.subject, to: message.to });
      return { ok: false, error: "WHATSAPP_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID not configured" };
    }
    try {
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${cfg.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: message.to,
            type: "text",
            text: { body: `${message.subject}\n\n${message.text}` },
          }),
        },
      );
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return { ok: false, error: `WhatsApp API ${response.status}: ${body}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
