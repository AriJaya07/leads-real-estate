import "server-only";
import { Resend } from "resend";
import type { NotificationMessage, Notifier } from "@/domain/sync/ports";
import { serverEnv } from "@/shared/config/env";

let client: Resend | null | undefined;

function resend(): Resend | null {
  if (client !== undefined) return client;
  const key = serverEnv().RESEND_API_KEY;
  client = key ? new Resend(key) : null;
  return client;
}

/**
 * Email channel. Degrades to a log line when unconfigured rather than throwing —
 * a missing mail provider must never break ingestion.
 */
export const emailNotifier: Notifier = {
  channel: "email",
  async send(message: NotificationMessage) {
    const api = resend();
    if (!api) {
      console.warn(`[notify:email] not configured; would send "${message.subject}" to ${message.to}`);
      return { ok: false, error: "RESEND_API_KEY not configured" };
    }
    try {
      const result = await api.emails.send({
        from: serverEnv().RESEND_FROM_EMAIL,
        to: message.to,
        subject: message.subject,
        html: message.html ?? `<pre>${message.text}</pre>`,
        text: message.text,
      });
      if (result.error) return { ok: false, error: result.error.message };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
