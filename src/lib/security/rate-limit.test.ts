import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  bucketKey,
  clientIpFrom,
  limitMultiplier,
  secondsToWindowEnd,
  tooManyMessage,
} from "./rate-limit";

describe("rate limit", () => {
  it("ключ — действие + sha256, без открытого email; регистр и пробелы не важны", () => {
    const k = bucketKey("login_id", " Admin@Example.TJ ");
    expect(k).toMatch(/^login_id:[0-9a-f]{64}$/);
    expect(k).not.toContain("example");
    expect(k).toBe(bucketKey("login_id", "admin@example.tj"));
    expect(k).not.toBe(bucketKey("reset_email", "admin@example.tj"));
  });
  it("IP — первый из x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientIpFrom(h)).toBe("203.0.113.5");
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
  it("время до конца окна и сообщение", () => {
    expect(secondsToWindowEnd(900, 900_000 * 10 + 60_000)).toBe(840);
    expect(tooManyMessage(840)).toBe("Слишком много попыток. Повторите через 14 мин.");
    expect(tooManyMessage(5)).toBe("Слишком много попыток. Повторите через 1 мин.");
  });
  it("множитель только в local", () => {
    expect(limitMultiplier({ NEXT_PUBLIC_APP_ENV: "local", RATE_LIMIT_MULTIPLIER: "100" })).toBe(
      100,
    );
    expect(limitMultiplier({ NEXT_PUBLIC_APP_ENV: "staging", RATE_LIMIT_MULTIPLIER: "100" })).toBe(
      1,
    );
    expect(
      limitMultiplier({ NEXT_PUBLIC_APP_ENV: "production", RATE_LIMIT_MULTIPLIER: "100" }),
    ).toBe(1);
    expect(limitMultiplier({ NEXT_PUBLIC_APP_ENV: "local", RATE_LIMIT_MULTIPLIER: "abc" })).toBe(1);
  });
});
