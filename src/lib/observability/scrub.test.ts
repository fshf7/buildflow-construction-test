import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { scrubBreadcrumb, scrubEvent, scrubText } from "./scrub";

describe("scrubText", () => {
  it("вырезает суммы, email и телефоны", () => {
    const s = scrubText(
      "Оплата 150 000,00 TJS от ivanov@mail.tj, тел. +992 90 123 45 67, долг 90000.5",
    );
    expect(s).not.toMatch(/150|90 123|90000|ivanov/);
    expect(s).toContain("[email]");
    expect(s).toContain("[телефон]");
    expect(s).toContain("[число] TJS");
  });
  it("короткие числа (строка 3, код 404) оставляет — без них ошибка непонятна", () => {
    expect(scrubText("Ошибка 404 в строке 3")).toBe("Ошибка 404 в строке 3");
  });
});

describe("scrubEvent", () => {
  it("событие уходит без запроса, пользователя и сумм", () => {
    const event = {
      message: "Сумма больше долга: 60 000,00 TJS",
      user: { id: "8d6f0d0c-1f0a-4b5f-9a59-0c6a2b9b7c11", email: "a@b.tj", ip_address: "1.2.3.4" },
      request: {
        url: "https://x/finance?account=1",
        data: "{amount:60000}",
        cookies: { sb: "t" },
        headers: { a: "b" },
      },
      exception: { values: [{ type: "Error", value: "BF_OVERPAYMENT 60000.00" }] },
      extra: { body: "секрет" },
      breadcrumbs: [
        { category: "console", message: "a@b.tj" },
        { category: "fetch", data: { url: "https://x/api?token=1", method: "POST", body: "pwd" } },
      ],
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.user).toEqual({ id: "8d6f0d0c-1f0a-4b5f-9a59-0c6a2b9b7c11" });
    expect(out.request).toEqual({ url: "https://x/finance" });
    expect(out.message).toBe("Сумма больше долга: [число] TJS");
    expect(out.exception?.values?.[0]?.value).toBe("BF_OVERPAYMENT [число]");
    expect(out.extra).toBeUndefined();
    expect(out.breadcrumbs).toEqual([
      { category: "fetch", data: { url: "https://x/api", method: "POST" } },
    ]);
  });
  it("не-uuid пользователь не отправляется", () => {
    const out = scrubEvent({ user: { email: "a@b.tj" } } as unknown as ErrorEvent);
    expect(out.user).toBeUndefined();
  });
  it("breadcrumb консоли отбрасывается", () =>
    expect(scrubBreadcrumb({ category: "console" })).toBeNull());
});
