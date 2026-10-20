import { devices, expect, test, type Browser, type Page } from "@playwright/test";

import { ADMIN_STATE, submitLogin } from "./helpers/accounts";

// Д-87…Д-89: вход без писем — администратор заводит сотрудника по логину (телефон или имя),
// временный пароль показывается один раз; при первом входе — обязательная смена; сброс пароля
// администратором завершает сессии сотрудника и пишется в аудит.
const run = Date.now().toString(36);
const phoneDigits = () => String(Math.floor(100_000_000 + Math.random() * 899_999_999));

async function addEmployee(admin: Page, fullName: string, login: string) {
  await admin.goto("/admin/members/new");
  await admin.getByLabel("ФИО").fill(fullName);
  await admin.getByLabel("Логин для входа").fill(login);
  await admin.getByLabel("Заведующий складом").check();
  await admin.getByRole("button", { name: "Добавить сотрудника" }).click();
  await expect(admin.getByRole("status", { name: /добавлен/ })).toBeVisible();
  await expect(admin.getByText("Пароль показывается один раз")).toBeVisible();
  return (await admin.getByTestId("issued-password").textContent())!.trim();
}

async function onPhone(browser: Browser) {
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    storageState: { cookies: [], origins: [] },
  });
  return { ctx, page: await ctx.newPage() };
}

test("сотрудник по телефону: временный пароль → обязательная смена → сброс администратором", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "администратор — десктоп; сотрудник внутри теста — на смартфоне");
  test.setTimeout(120_000);
  const digits = phoneDigits();
  const phone = `+992 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  const fullName = `Кладовщик Телефонов ${run}`;

  const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminCtx.newPage();
  const temp = await addEmployee(admin, fullName, phone);
  expect(temp).toMatch(/^[A-HJ-NP-Za-hj-km-np-z2-9]{14}$/); // без похожих символов

  // Дубль логина — понятная ошибка (в любой записи номера).
  await admin.goto("/admin/members/new");
  await admin.getByLabel("ФИО").fill(`Дубль ${run}`);
  await admin.getByLabel("Логин для входа").fill(`+992${digits}`);
  await admin.getByLabel("Заведующий складом").check();
  await admin.getByRole("button", { name: "Добавить сотрудника" }).click();
  await expect(admin.getByRole("alert").filter({ hasText: "Такой логин уже занят" })).toBeVisible();

  // Первый вход: только смена пароля — в приложение не пускает.
  const emp = await onPhone(browser);
  await submitLogin(emp.page, phone, temp);
  await expect(emp.page).toHaveURL(/\/set-password/);
  await emp.page.goto("/");
  await expect(emp.page).toHaveURL(/\/set-password/);
  await emp.page.getByLabel("Новый пароль").fill(temp);
  await emp.page.getByLabel("Повторите пароль").fill(temp);
  await emp.page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(
    emp.page.getByRole("alert").filter({ hasText: "должен отличаться от временного" }),
  ).toBeVisible();
  const own = `Sklad-${run}-pass`;
  await emp.page.getByLabel("Новый пароль").fill(own);
  await emp.page.getByLabel("Повторите пароль").fill(own);
  await emp.page.getByRole("button", { name: "Сохранить пароль" }).click();
  // Д-94: после смены пароля — выбор объекта.
  await expect(emp.page.getByRole("heading", { name: "Выберите объект" })).toBeVisible();

  // Временный пароль больше не действует.
  const again = await onPhone(browser);
  await submitLogin(again.page, phone, temp);
  await expect(
    again.page.getByRole("alert").filter({ hasText: "Неверный логин или пароль" }),
  ).toBeVisible();
  await again.ctx.close();

  // Сброс администратором: причина, новый пароль один раз, сессия сотрудника завершена сразу.
  await admin.goto("/admin/members");
  await admin.getByRole("link", { name: new RegExp(fullName) }).click();
  await admin.getByRole("button", { name: "Сбросить пароль" }).click();
  await admin.getByRole("dialog").getByLabel("Причина").fill("Забыл пароль");
  await admin.getByRole("dialog").getByRole("button", { name: "Сбросить пароль" }).click();
  await expect(admin.getByRole("status", { name: /Новый временный пароль/ })).toBeVisible();
  const temp2 = (await admin.getByTestId("issued-password").textContent())!.trim();
  expect(temp2).not.toBe(temp);

  await emp.page.goto("/");
  await expect(emp.page).toHaveURL(/\/login/);
  await submitLogin(emp.page, phone, own);
  await expect(
    emp.page.getByRole("alert").filter({ hasText: "Неверный логин или пароль" }),
  ).toBeVisible();
  await submitLogin(emp.page, phone, temp2);
  await expect(emp.page).toHaveURL(/\/set-password/);
  await emp.ctx.close();

  // Аудит: сброс с причиной.
  await admin.goto("/admin/audit");
  const row = admin.getByRole("row", { name: /Забыл пароль/ }).first();
  await expect(row.getByText("Сброс пароля")).toBeVisible();

  // Себе сбросить пароль нельзя — кнопки нет.
  await admin.goto("/admin/members");
  await admin.getByRole("link", { name: /Локальный администратор/ }).click();
  await expect(admin.getByText("Свой пароль сбрасывает другой администратор")).toBeVisible();
  await expect(admin.getByRole("button", { name: "Сбросить пароль" })).toHaveCount(0);
  await adminCtx.close();
});

test("сотрудник по имени латиницей входит и меняет пароль", async ({ browser, isMobile }) => {
  test.skip(isMobile, "один раз");
  const login = `kladovshik.${run}`;
  const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
  const temp = await addEmployee(
    await adminCtx.newPage(),
    `Кладовщик Латинский ${run}`,
    login.toUpperCase(),
  );
  await adminCtx.close();

  const emp = await onPhone(browser);
  await submitLogin(emp.page, ` ${login} `, temp);
  await expect(emp.page).toHaveURL(/\/set-password/);
  const own = `Name-${run}-pass`;
  await emp.page.getByLabel("Новый пароль").fill(own);
  await emp.page.getByLabel("Повторите пароль").fill(own);
  await emp.page.getByRole("button", { name: "Сохранить пароль" }).click();
  // В приложении: выбор объекта или (единственный объект без «Общего») сразу объект — Д-94.
  await expect(emp.page).not.toHaveURL(/\/set-password/);
  await expect(emp.page.getByRole("heading", { level: 1 })).toBeVisible();
  await emp.ctx.close();
});

test("страница входа: без восстановления по почте", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Забыли пароль? Обратитесь к администратору.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Забыли пароль/ })).toHaveCount(0);
  // Страницы восстановления по почте больше нет: без входа — на страницу входа.
  await page.goto("/forgot-password");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Отправить ссылку" })).toHaveCount(0);
});
