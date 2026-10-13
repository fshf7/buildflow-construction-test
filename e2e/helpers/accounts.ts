import { expect, type Page } from "@playwright/test";

export {
  LOCAL_ACCOUNTANT,
  LOCAL_ADMIN,
  LOCAL_CASHIER,
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
export const ACCOUNTANT_STATE = "e2e/.auth/accountant.json";
export const CASHIER_STATE = "e2e/.auth/cashier.json";

/**
 * Подключение второго фактора на экране /mfa (режим enroll). Возвращает секрет TOTP.
 * Код может «протухнуть» на границе 30-секундного окна — тогда, как человек, вводим следующий.
 */
export async function enrollMfa(
  page: Page,
  totp: (secret: string, now?: number) => string,
): Promise<string> {
  await expect(page.getByRole("heading", { name: "Подключите второй фактор" })).toBeVisible();
  await page.getByRole("button", { name: "Подключить приложение" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
  expect(secret).not.toBe("");
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Не отправляем код в последние 3 секунды окна — иначе он истечёт по дороге.
    const msLeft = 30_000 - (Date.now() % 30_000);
    if (msLeft < 3_000) await page.waitForTimeout(msLeft + 200);
    await page.getByLabel("Код из приложения").fill(totp(secret));
    await page.getByRole("button", { name: "Подтвердить" }).click();
    const done = await page
      .getByRole("heading", { name: "Главная" })
      .waitFor({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (done) return secret;
  }
  throw new Error("Второй фактор не подтвердился за 3 попытки");
}

/** Выбор в нативном select по части текста пункта (подписи с суммами содержат неразрывные пробелы). */
export async function selectByText(page: Page, label: string, text: string) {
  const select = page.getByLabel(label);
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  if (!value) throw new Error(`Нет пункта «${text}» в списке «${label}»`);
  await select.selectOption(value);
}
