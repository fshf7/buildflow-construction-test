import { expect, test } from "@playwright/test";

import { ADMIN_STATE, enrollMfa, LOCAL_ACCOUNTANT, login } from "./helpers/accounts";
import { totp } from "./helpers/totp";

// Д-45: администратор сбрасывает второй фактор бухгалтеру; тот обязан подключить его заново.
test("сброс MFA участнику: причина, аудит, повторное подключение", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "проверяем один раз — на десктопе (общий тестовый пользователь)");
  const reason = `Потерян телефон ${Date.now()}`;

  // 1. Бухгалтер входит и подключает второй фактор (сброшен в global-setup).
  const accCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const acc = await accCtx.newPage();
  await login(acc, LOCAL_ACCOUNTANT.email, LOCAL_ACCOUNTANT.password);
  await expect(acc).toHaveURL(/\/mfa/);
  await enrollMfa(acc, totp);
  // Вкладку бухгалтера не закрываем: после сброса она должна потерять доступ сразу (Д-47).

  // 2. Администратор (aal2) видит подключённый фактор и сбрасывает его с причиной.
  const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminCtx.newPage();
  await admin.goto("/admin/members");
  await admin.getByRole("link", { name: new RegExp(LOCAL_ACCOUNTANT.fullName) }).click();
  await expect(admin.getByText("Подключён")).toBeVisible();
  await admin.getByRole("button", { name: "Сбросить второй фактор" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByRole("button", { name: "Сбросить" }).click();
  await expect(dialog.getByText("Укажите причину")).toBeVisible(); // причина обязательна
  await dialog.getByLabel("Причина").fill(reason);
  await dialog.getByRole("button", { name: "Сбросить" }).click();
  await expect(admin.getByText("Не подключён")).toBeVisible();

  // 3. Себе сбросить нельзя — кнопки нет.
  await admin.goto("/admin/members");
  await admin.getByRole("link", { name: /Локальный администратор/ }).click();
  await expect(admin.getByText("Свой второй фактор сбрасывает другой администратор")).toBeVisible();
  await expect(admin.getByRole("button", { name: "Сбросить второй фактор" })).toHaveCount(0);

  // 4. Аудит: событие с причиной.
  await admin.goto("/admin/audit");
  const row = admin.getByRole("row", { name: new RegExp(reason) });
  await expect(row.getByText("Сброс второго фактора")).toBeVisible();
  await expect(row.getByText("Локальный администратор")).toBeVisible();
  await adminCtx.close();

  // 5. Открытая сессия бухгалтера завершена сразу, хотя access-токен ещё не истёк.
  await acc.goto("/projects");
  await expect(acc).toHaveURL(/\/login/);
  await accCtx.close();

  // 6. Бухгалтер при следующем входе обязан подключить второй фактор заново (не «ввести код»).
  await login(page, LOCAL_ACCOUNTANT.email, LOCAL_ACCOUNTANT.password);
  await expect(page).toHaveURL(/\/mfa/);
  await expect(page.getByRole("heading", { name: "Подключите второй фактор" })).toBeVisible();
});
