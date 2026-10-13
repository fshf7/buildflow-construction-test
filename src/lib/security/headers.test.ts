import { describe, expect, it } from "vitest";

import { buildCsp, newNonce, securityHeaders, sentryOrigin } from "./headers";

describe("CSP", () => {
  const prod = buildCsp({
    nonce: "abc",
    supabaseUrl: "https://ref.supabase.co/",
    sentryDsn: "https://key@o1.ingest.de.sentry.io/42",
    dev: false,
  });
  it("скрипты только с nonce, без unsafe-inline/eval в production", () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
  });
  it("Supabase и Sentry разрешены точно по origin; встраивание запрещено", () => {
    expect(prod).toContain(
      "connect-src 'self' https://ref.supabase.co https://o1.ingest.de.sentry.io",
    );
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("upgrade-insecure-requests");
  });
  it("dev: eval и websocket для перезагрузки", () => {
    const dev = buildCsp({ nonce: "n", supabaseUrl: "http://127.0.0.1:54421", dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
  it("кривой DSN не ломает CSP", () => expect(sentryOrigin("not a url")).toBeNull());
});

describe("заголовки", () => {
  it("HSTS только вне локальной разработки", () => {
    expect(securityHeaders({ csp: "x", hsts: true })["Strict-Transport-Security"]).toBeDefined();
    expect(securityHeaders({ csp: "x", hsts: false })["Strict-Transport-Security"]).toBeUndefined();
    expect(securityHeaders({ csp: "x", hsts: false })["X-Frame-Options"]).toBe("DENY");
  });
  it("nonce случайный", () => expect(newNonce()).not.toBe(newNonce()));
});
