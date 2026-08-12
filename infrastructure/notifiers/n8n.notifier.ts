import "server-only";
import type { NotificationMessage, Notifier } from "@/domain/sync/ports";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("notify:n8n");

/**
 * Delivery-only relay to n8n workflow 08 (`n8n/workflows/notifications/08-notification-delivery.json`).
 * The app still decides who/when/what (dedup, throttle, alert-rule matching,
 * message rendering); this adapter only hands the rendered message to n8n for
 * the actual channel-specific send, so the WhatsApp Cloud API token and Slack
 * webhook URL live in n8n credentials, not app secrets.
 *
 * Deliberately NOT used for the "email" channel — that stays on the direct
 * `emailNotifier` (Resend) because "email" is shared with password-reset and
 * team-invite sends (see `application/auth/password-reset.actions.ts`,
 * `application/auth/invite.actions.ts`), and those must not depend on an
 * external automation tool being reachable.
 */
export function n8nNotifier(channel: "whatsapp" | "slack"): Notifier {
  return {
    channel,
    async send(message: NotificationMessage) {
      const url = serverEnv().N8N_NOTIFY_WEBHOOK_URL;
      const secret = serverEnv().AVERONAI_NOTIFY_SHARED_SECRET;
      if (!url || !secret) {
        log.warn("not configured; dropping message", { channel, subject: message.subject, to: message.to });
        return { ok: false, error: "N8N_NOTIFY_WEBHOOK_URL/AVERONAI_NOTIFY_SHARED_SECRET not configured" };
      }
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-averonai-notify-secret": secret,
          },
          body: JSON.stringify({
            channel,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          return { ok: false, error: `n8n notify ${response.status}: ${body}` };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
