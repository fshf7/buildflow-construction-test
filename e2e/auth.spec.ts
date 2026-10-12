import { expect, test } from "@playwright/test";

// Пользователь из supabase/seed.sql (только локально и в CI).
const EMAIL = "admin@buildflow.local";
const PASSWORD = "buildflow-local";

test("неавторизованного пользователя ведёт на вход", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
});

test("неверный пароль показывает ошибку", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Пароль").fill("wrong-password");
  await page.getByRole("button", { name: "Войти" }).click();
  // role="alert" есть и у служебного анонсера маршрутов Next.js — фильтруем по тексту.
  await expect(
    page.getByRole("alert").filter({ hasText: "Неверный email или пароль" }),
  ).toBeVisible();
});

test("вход, главная, выход", async ({ page, isMobile }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Пароль").fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Главная" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Открыть меню" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Главная" })).toBeVisible();
    await page.keyboard.press("Escape");
  }

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login/);
});
