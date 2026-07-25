import type { LeadRow } from "@/infrastructure/db/schema/leads";
import type { NotificationMessage } from "@/domain/sync/ports";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

function formatBudget(lead: LeadRow): string {
  if (lead.budgetMin === null && lead.budgetMax === null) return "not stated";
  const currency = lead.budgetCurrency ?? "";
  const format = (value: number | null) =>
    value === null ? "?" : new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
  if (lead.budgetMin === lead.budgetMax) return `${currency} ${format(lead.budgetMin)}`;
  return `${currency} ${format(lead.budgetMin)} – ${format(lead.budgetMax)}`;
}

function contactLine(lead: LeadRow): string {
  const parts = [lead.contact?.whatsapp, lead.contact?.phone, lead.contact?.email].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "no contact details published";
}

function renderRow(lead: LeadRow): string {
  const reasons = (lead.scoreReasons ?? [])
    .slice(0, 3)
    .map((r) => escapeHtml(r.label))
    .join(" · ");

  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e6e6e6;">
        <div style="font:600 15px/1.4 system-ui,sans-serif;">
          ${escapeHtml(lead.authorName ?? "Unknown")}
          <span style="color:#6b7280;font-weight:400;">— intent ${lead.intentScore}/100</span>
        </div>
        <div style="font:400 14px/1.5 system-ui,sans-serif;color:#374151;margin:6px 0;">
          ${escapeHtml(lead.body.slice(0, 260))}${lead.body.length > 260 ? "…" : ""}
        </div>
        <div style="font:400 13px/1.5 system-ui,sans-serif;color:#6b7280;">
          Wants: ${escapeHtml(lead.propertyTypes.join(", ") || "unspecified")} ·
          Where: ${escapeHtml(lead.locations.join(", ") || "unspecified")} ·
          Budget: ${escapeHtml(formatBudget(lead))}
        </div>
        <div style="font:400 13px/1.5 system-ui,sans-serif;color:#6b7280;">
          Contact: ${escapeHtml(contactLine(lead))}
        </div>
        ${reasons ? `<div style="font:400 12px/1.5 system-ui,sans-serif;color:#9ca3af;margin-top:4px;">Why: ${reasons}</div>` : ""}
        ${lead.externalUrl ? `<div style="margin-top:8px;"><a href="${escapeHtml(lead.externalUrl)}" style="font:600 13px system-ui,sans-serif;color:#1d4ed8;text-decoration:none;">Open original post →</a></div>` : ""}
      </td>
    </tr>`;
}

/**
 * Digest rather than one email per lead. Every row leads with the information an
 * agent needs to decide whether to call: who, what they want, budget, and how to
 * reach them — plus why the system scored it that way.
 */
export function renderLeadDigest(
  ruleName: string,
  leads: LeadRow[],
  recipient: string,
): NotificationMessage {
  const count = leads.length;
  const plural = count === 1 ? "" : "s";
  const subject = `${count} new lead${plural} — ${ruleName}`;

  const text = leads
    .map(
      (lead) =>
        `${lead.authorName ?? "Unknown"} (${lead.intentScore}/100)\n${lead.body.slice(0, 200)}\nWants: ${lead.propertyTypes.join(", ") || "unspecified"} | Where: ${lead.locations.join(", ") || "unspecified"} | Budget: ${formatBudget(lead)}\nContact: ${contactLine(lead)}\n${lead.externalUrl ?? ""}`,
    )
    .join("\n\n---\n\n");

  const html = `
    <div style="max-width:640px;margin:0 auto;font-family:system-ui,sans-serif;">
      <h2 style="font:600 18px/1.3 system-ui,sans-serif;margin:0 0 4px;">
        ${count} new lead${plural} matched "${escapeHtml(ruleName)}"
      </h2>
      <p style="font:400 14px/1.5 system-ui,sans-serif;color:#6b7280;margin:0 0 16px;">
        Detected in the latest sync. Speed matters more than polish here — these
        posts are getting replies from other agents right now.
      </p>
      <table style="width:100%;border-collapse:collapse;">${leads.map(renderRow).join("")}</table>
    </div>`;

  return { to: recipient, subject, text, html };
}
