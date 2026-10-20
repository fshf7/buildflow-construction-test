import { expect, test } from "@playwright/test";

import { LOCAL_ADMIN, LOCAL_FOREMAN, login, logout, submitLogin } from "./helpers/accounts";

test("неавторизованного пользователя ведёт на вход", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
});

test("неверный пароль показывает ошибку", async ({ page }) => {
  await submitLogin(page, LOCAL_FOREMAN.email, "wrong-password");
  // role="alert" есть и у служебного анонсера маршрутов Next.js — фильтруем по тексту.
  await expect(
    page.getByRole("alert").filter({ hasText: "Неверный логин или пароль" }),
  ).toBeVisible();
});

test("прораб входит без MFA и видит только свои разделы", async ({ page, isMobile }) => {
  await login(page, LOCAL_FOREMAN.email, LOCAL_FOREMAN.password);
  // Д-94: главный экран — выбор объекта и «Общее по организации».
  await expect(page.getByRole("heading", { name: "Выберите объект" })).toBeVisible();

  if (isMobile) await page.getByRole("button", { name: "Открыть меню" }).click();
  const nav = page.getByRole("navigation", { name: "Основная навигация" }).last();
  await expect(nav.getByRole("link", { name: "Выбор объекта" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Бригады" })).toBeVisible();
  await expect(nav.getByText("Участники")).toHaveCount(0);
  await expect(nav.getByText("Журнал аудита")).toHaveCount(0);
  if (isMobile) await page.keyboard.press("Escape");

  // Прямой переход в чужой раздел — экран «Нет доступа» (данные защищает ещё и RLS).
  await page.goto("/admin/members");
  await expect(page).toHaveURL(/\/no-access\?reason=forbidden/);

  await page.goto("/");
  await logout(page);
});

test("администратор без второго фактора не попадает в приложение (Д-29)", async ({ page }) => {
  await login(page, LOCAL_ADMIN.email, LOCAL_ADMIN.password);
  await expect(page).toHaveURL(/\/mfa/);
  await page.goto("/admin/members");
  await expect(page).toHaveURL(/\/mfa\?next=%2Fadmin%2Fmembers/);
});
