import { expect, test, type Page } from "@playwright/test";

import { login, logout } from "./helpers/accounts";
import { createThrowawayMember } from "./helpers/fixture";
import { clearMailbox, countMessages, waitForConfirmLink } from "./helpers/mailpit";

/**
 * Запрос ссылки с повтором: Supabase молча отклоняет частые запросы (max_frequency), а приложение
 * намеренно этого не показывает (иначе раскрывался бы факт существования email).
 */
async function requestResetLink(page: Page, email: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    await clearMailbox(email);
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Отправить ссылку" }).click();
    await expect(page.getByRole("status")).toContainText(`Если учётная запись ${email} существует`);
    try {
      return await waitForConfirmLink(email, 4_000);
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}

// Восстановление пароля — один раз, на десктопе.
test.describe("восстановление пароля", () => {
  // Один пользователь и один токен восстановления на всех — строго по очереди.
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "проверяем один раз — на десктопе");

  // Свой пользователь: тест меняет пароль, общие тестовые учётки трогать нельзя (параллельные тесты).
  let user: { email: string; password: string };
  test.beforeAll(async () => {
    user = await createThrowawayMember();
  });

  test("неизвестный email: тот же ответ, письма нет", async ({ page }) => {
    const unknown = `nobody-${Date.now()}@buildflow.local`;
    await page.goto("/login");
    await page.getByRole("link", { name: "Забыли пароль?" }).click();
    await expect(page.getByRole("heading", { name: "Восстановление пароля" })).toBeVisible();
    await page.getByLabel("Email").fill(unknown);
    await page.getByRole("button", { name: "Отправить ссылку" }).click();
    await expect(page.getByRole("status")).toContainText(
      `Если учётная запись ${unknown} существует`,
    );
    await page.waitForTimeout(1500);
    expect(await countMessages(unknown)).toBe(0);
  });

  test("повторный запрос сразу — тот же ответ (частота не раскрывает email)", async ({ page }) => {
    for (let i = 0; i < 2; i++) {
      await page.goto("/forgot-password");
      await page.getByLabel("Email").fill(user.email);
      await page.getByRole("button", { name: "Отправить ссылку" }).click();
      await expect(page.getByRole("status")).toContainText("Если учётная запись");
    }
  });

  test("письмо → новый пароль → вход с новым паролем", async ({ page }) => {
    const newPassword = `new-pass-${Date.now()}`;
    await page.goto(await requestResetLink(page, user.email));
    await expect(page).toHaveURL(/\/reset-password/);
    await page.getByLabel("Новый пароль").fill(newPassword);
    await page.getByLabel("Повторите пароль").fill(newPassword);
    await page.getByRole("button", { name: "Сохранить пароль" }).click();
    await expect(page.getByRole("heading", { name: "Главная" })).toBeVisible();
    await logout(page);

    // Старый пароль больше не подходит, новый — подходит.
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Пароль").fill(user.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Неверный email или пароль" }),
    ).toBeVisible();
    await login(page, user.email, newPassword);
    await expect(page.getByRole("heading", { name: "Главная" })).toBeVisible();
  });

  test("ссылку из письма нельзя использовать дважды", async ({ page }) => {
    const link = await requestResetLink(page, user.email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password/);
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page).toHaveURL(/\/login\?error=link/);
  });
});
