/**
 * Rejects a webhook URL whose host is a literal loopback/private/link-local
 * address — an admin-controlled field that this codebase's outbound webhook
 * sender (`infrastructure/webhooks/outbound-webhook.ts::sendWebhook`) later
 * `fetch()`es server-side on every lead update, alert match, and alert send.
 * Without this, an admin (or anyone who compromises an admin session) could
 * point the webhook at an internal service or a cloud metadata endpoint
 * (169.254.169.254) and have the server make that request on their behalf.
 *
 * Deliberately literal-address-only, not a DNS-resolving check: this runs at
 * save time in a Zod refine (`automation-settings.actions.ts`), not at send
 * time, so it can't chase a hostname that resolves differently later
 * (DNS rebinding) — that would need a resolve-and-check step in the sender
 * itself, a separate, larger change. This still closes the common, direct
 * case: an admin literally typing an internal IP or `localhost`.
 */
export function isPrivateOrLoopbackWebhookUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // an unparseable URL is rejected elsewhere by the existing http(s):// check
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;

  const bareHost = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  const ipv4 = bareHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
    if (a === 0) return true; // "this network"
    return false;
  }

  if (bareHost === "::1" || bareHost === "::") return true; // IPv6 loopback / unspecified
  if (bareHost.startsWith("fe80:")) return true; // IPv6 link-local
  if (bareHost.startsWith("fc") || bareHost.startsWith("fd")) return true; // IPv6 unique-local (fc00::/7)

  return false;
}
