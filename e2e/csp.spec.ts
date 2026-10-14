import { expect, test } from "@playwright/test";

import { ACCOUNTANT_STATE } from "./helpers/accounts";

// Д-81: CSP с nonce не должен блокировать скрипты приложения — ни на страницах входа (раньше они
// собирались статически, без nonce, и оставались без JavaScript), ни внутри приложения.
const violations = (msgs: string[]) => msgs.filter((m) => /Content Security Policy/i.test(m));

test("страницы входа: скрипты не заблокированы, форма работает", async ({ page }) => {
  const msgs: string[] = [];
  page.on("console", (m) => msgs.push(m.text()));
  for (const path of ["/login", "/forgot-password"]) await page.goto(path);
  await page.goto("/login");
  await page.getByLabel("Логин").fill("nobody@example.com");
  await page.getByLabel("Пароль").fill("wrong-password-123");
  await page.getByRole("button", { name: "Войти" }).click();
  // Ошибка показана клиентским кодом — значит, страница ожила.
  await expect(
    page.getByRole("alert").filter({ hasText: /Неверный логин или пароль|Слишком много попыток/ }),
  ).toBeVisible();
  expect(violations(msgs)).toEqual([]);
});

test("внутри приложения нарушений CSP нет", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ACCOUNTANT_STATE });
  const page = await ctx.newPage();
  const msgs: string[] = [];
  page.on("console", (m) => msgs.push(m.text()));
  for (const path of ["/", "/finance/payables", "/reports/payables", "/procurement"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations(msgs)).toEqual([]);
  const res = await page.request.get("/login");
  expect(res.headers()["content-security-policy"]).toContain("'strict-dynamic'");
  await ctx.close();
});
