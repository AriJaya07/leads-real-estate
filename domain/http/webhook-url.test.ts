import { describe, expect, it } from "vitest";
import { isPrivateOrLoopbackWebhookUrl } from "./webhook-url";

describe("isPrivateOrLoopbackWebhookUrl", () => {
  it("allows an ordinary public https URL", () => {
    expect(isPrivateOrLoopbackWebhookUrl("https://hooks.example.com/averonai")).toBe(false);
  });

  it("rejects localhost and its subdomains", () => {
    expect(isPrivateOrLoopbackWebhookUrl("http://localhost:3000/hook")).toBe(true);
    expect(isPrivateOrLoopbackWebhookUrl("http://foo.localhost/hook")).toBe(true);
  });

  it("rejects loopback and RFC1918 private IPv4 ranges", () => {
    expect(isPrivateOrLoopbackWebhookUrl("http://127.0.0.1/hook")).toBe(true);
    expect(isPrivateOrLoopbackWebhookUrl("http://10.0.0.5/hook")).toBe(true);
    expect(isPrivateOrLoopbackWebhookUrl("http://172.16.0.1/hook")).toBe(true);
    expect(isPrivateOrLoopbackWebhookUrl("http://192.168.1.1/hook")).toBe(true);
  });

  it("rejects the cloud metadata link-local address", () => {
    expect(isPrivateOrLoopbackWebhookUrl("http://169.254.169.254/latest/meta-data/")).toBe(true);
  });

  it("rejects CGNAT and 'this network' ranges", () => {
    expect(isPrivateOrLoopbackWebhookUrl("http://100.64.0.1/hook")).toBe(true);
    expect(isPrivateOrLoopbackWebhookUrl("http://0.0.0.1/hook")).toBe(true);
  });

  it("allows a public IPv4 address", () => {
    expect(isPrivateOrLoopbackWebhookUrl("http://8.8.8.8/hook")).toBe(false);
  });

  it("rejects IPv6 loopback, unspecified, link-local and unique-local", () => {
    expect(isPrivateOrLoopbackWebhookUrl("http://[::1]/hook")).toBe(true);
    expect(isPrivateOrLoopbackWebhookUrl("http://[::]/hook")).toBe(true);
    expect(isPrivateOrLoopbackWebhookUrl("http://[fe80::1]/hook")).toBe(true);
    expect(isPrivateOrLoopbackWebhookUrl("http://[fd00::1]/hook")).toBe(true);
  });

  it("does not throw and returns false on an unparseable URL", () => {
    expect(isPrivateOrLoopbackWebhookUrl("not a url")).toBe(false);
  });
});
