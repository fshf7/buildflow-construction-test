import { expect, test } from "@playwright/test";

// Smoke развёрнутого окружения: доступность, защита маршрутов, закрытая регистрация и данные.
// Не создаёт пользователей и не меняет данные.
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;

test("заголовки безопасности и health", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok", db: "ok", env: "staging" });
});

test("страница входа на русском", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Пароль")).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();
});

test("без входа разделы закрыты", async ({ page }) => {
  for (const path of ["/", "/finance", "/crews/acts", "/tasks", "/reports/payables"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("экспорт отчёта без входа не отдаёт данные", async ({ request }) => {
  const res = await request.get("/reports/payables/export?format=csv", { maxRedirects: 0 });
  expect([302, 303, 307, 401, 403]).toContain(res.status());
});

test("неверный пароль — понятная ошибка", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Пароль").fill("wrong-password-123");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Неверный email или пароль|Слишком много попыток/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("перебор пароля ограничен (Д-80): не больше 5 попыток на email за 15 мин", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "один раз: попытки расходуют лимит адреса раннера");
  const email = `smoke-limit-${Date.now()}@example.com`;
  let limited = false;
  for (let i = 0; i < 7 && !limited; i++) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill("wrong-password-123");
    await page.getByRole("button", { name: "Войти" }).click();
    // Сообщение формы (у Next.js есть и пустой alert-анонсер маршрутов — его не берём).
    const message = page
      .getByRole("alert")
      .filter({ hasText: /Неверный email или пароль|Слишком много попыток/ });
    await expect(message).toBeVisible();
    limited = ((await message.textContent()) ?? "").includes("Слишком много попыток");
  }
  expect(limited).toBe(true);
});

test.describe("Supabase API", () => {
  test.skip(
    !supabaseUrl || !publishableKey,
    "нужны E2E_SUPABASE_URL и E2E_SUPABASE_PUBLISHABLE_KEY",
  );
  const headers = () => ({ apikey: publishableKey!, "Content-Type": "application/json" });

  test("самостоятельная регистрация выключена", async ({ request }) => {
    const res = await request.post(`${supabaseUrl}/auth/v1/signup`, {
      headers: headers(),
      data: { email: `smoke-${Date.now()}@example.com`, password: "smoke-password-123" },
    });
    expect(res.ok()).toBe(false);
    expect(await res.text()).toMatch(/signup|disabled|not allowed/i);
  });

  test("анонимно таблицы недоступны", async ({ request }) => {
    for (const table of [
      "organizations",
      "cash_transactions",
      "payables",
      "work_completion_acts",
      "tasks",
    ]) {
      const res = await request.get(`${supabaseUrl}/rest/v1/${table}?select=id&limit=1`, {
        headers: headers(),
      });
      if (res.ok()) expect(await res.json()).toEqual([]);
      else expect([401, 403]).toContain(res.status());
    }
  });
});
