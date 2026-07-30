import { createServer, type IncomingMessage, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import { sendWebhook, signWebhookBody, type OutboundWebhookPayload } from "./outbound-webhook";

interface CapturedRequest {
  headers: IncomingMessage["headers"];
  body: string;
}

/** Spins up a throwaway HTTP server for one test, tearing it down afterward regardless of outcome. */
async function withTestServer(
  respond: (req: IncomingMessage, capture: CapturedRequest) => { status: number; body?: string },
  run: (url: string, captured: () => CapturedRequest | null) => Promise<void>,
): Promise<void> {
  let captured: CapturedRequest | null = null;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      captured = { headers: req.headers, body: raw };
      const { status, body } = respond(req, captured);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body ?? JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = address && typeof address === "object" ? `http://127.0.0.1:${address.port}` : "";

  try {
    await run(url, () => captured);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const samplePayload: OutboundWebhookPayload = {
  event: "lead.created_or_updated",
  companyId: "company-1",
  timestamp: "2026-07-30T00:00:00.000Z",
  data: [{ id: "lead-1", name: "Jane Doe" }],
};

describe("signWebhookBody", () => {
  it("is deterministic for the same secret and body", () => {
    const a = signWebhookBody("secret", '{"a":1}');
    const b = signWebhookBody("secret", '{"a":1}');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the secret or the body changes", () => {
    const base = signWebhookBody("secret", "body");
    expect(signWebhookBody("other-secret", "body")).not.toBe(base);
    expect(signWebhookBody("secret", "different body")).not.toBe(base);
  });
});

describe("sendWebhook", () => {
  it("delivers the exact payload with a valid X-DreamRue-Signature header", async () => {
    await withTestServer(
      () => ({ status: 200 }),
      async (url, captured) => {
        const result = await sendWebhook(url, "test-secret", samplePayload);

        expect(result.ok).toBe(true);
        expect(result.status).toBe(200);

        const request = captured();
        expect(request).not.toBeNull();
        expect(JSON.parse(request!.body)).toEqual(samplePayload);
        expect(request!.headers["x-dreamrue-signature"]).toBe(signWebhookBody("test-secret", request!.body));
      },
    );
  });

  it("omits the signature header entirely when no secret is configured", async () => {
    await withTestServer(
      () => ({ status: 200 }),
      async (url, captured) => {
        await sendWebhook(url, null, samplePayload);
        expect(captured()!.headers["x-dreamrue-signature"]).toBeUndefined();
      },
    );
  });

  it("treats a non-2xx response as a failure without throwing", async () => {
    await withTestServer(
      () => ({ status: 500, body: JSON.stringify({ error: "boom" }) }),
      async (url) => {
        const result = await sendWebhook(url, "secret", samplePayload);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(500);
      },
    );
  });

  it("degrades gracefully — ok:false, never throws — when the endpoint is unreachable", async () => {
    const result = await sendWebhook("http://127.0.0.1:1", "secret", samplePayload);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
