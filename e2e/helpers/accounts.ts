import { expect, type Page } from "@playwright/test";

export { LOCAL_ADMIN, LOCAL_FOREMAN } from "../../scripts/local-admin.mts";

/** Отправляет форму входа (результат проверяет вызывающий: ошибка, /mfa или приложение). */
export async function submitLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

/** Вход с ожиданием, пока приложение уйдёт со страницы входа (иначе следующий goto прервёт вход). */
export async function login(page: Page, email: string, password: string) {
  await submitLogin(page, email, password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Выйти" }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

export const ADMIN_STATE = "e2e/.auth/admin.json";
