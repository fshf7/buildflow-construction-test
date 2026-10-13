import { expect, test } from "@playwright/test";

// Smoke развёрнутого окружения: доступность, защита маршрутов, закрытая регистрация и данные.
// Не создаёт пользователей и не меняет данные.
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;

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
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
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
