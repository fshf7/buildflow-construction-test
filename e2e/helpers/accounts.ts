import { expect, type Page } from "@playwright/test";

export {
  LOCAL_ACCOUNTANT,
  LOCAL_ADMIN,
  LOCAL_FOREMAN,
  LOCAL_STOREKEEPER,
} from "../../scripts/local-admin.mts";

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

/** Подключение второго фактора на экране /mfa (режим enroll). Возвращает секрет TOTP. */
export async function enrollMfa(page: Page, totp: (secret: string) => string): Promise<string> {
  await expect(page.getByRole("heading", { name: "Подключите второй фактор" })).toBeVisible();
  await page.getByRole("button", { name: "Подключить приложение" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
  expect(secret).not.toBe("");
  await page.getByLabel("Код из приложения").fill(totp(secret));
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByRole("heading", { name: "Главная" })).toBeVisible();
  return secret;
}
