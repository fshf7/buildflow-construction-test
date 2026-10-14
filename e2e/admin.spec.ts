import { expect, test } from "@playwright/test";

import { ADMIN_STATE, LOCAL_FOREMAN, login } from "./helpers/accounts";

// Уникальные значения на прогон: тесты не мешают друг другу и повторным запускам.
const run = Date.now().toString(36);

test.describe("администратор", () => {
  test.use({ storageState: ADMIN_STATE });

  test("видит управление участниками и аудит", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) await page.getByRole("button", { name: "Открыть меню" }).click();
    const nav = page.getByRole("navigation", { name: "Основная навигация" }).last();
    await expect(nav.getByRole("link", { name: "Участники" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Журнал аудита" })).toBeVisible();
  });

  test("объект: создание, склад, блок и этаж; прораб без назначения его не видит", async ({
    page,
    browser,
    isMobile,
  }) => {
    const code = `E${run}${isMobile ? "M" : "D"}`;
    await page.goto("/projects/new");
    await page.getByLabel("Код").fill(code);
    await page.getByLabel("Название").fill(`Тестовый объект ${code}`);
    await page.getByRole("button", { name: "Создать объект" }).click();

    await expect(
      page.getByRole("heading", { name: `${code} — Тестовый объект ${code}` }),
    ).toBeVisible();
    await expect(page.getByText(`Склад Тестовый объект ${code}`)).toBeVisible();

    await page.getByLabel("Название нового блока").fill("Блок А");
    await page.getByRole("button", { name: "Добавить блок" }).click();
    await expect(page.getByText("Блок А", { exact: true })).toBeVisible();
    await page.getByLabel("Новый этаж в блоке Блок А").fill("1");
    await page.getByRole("button", { name: "Добавить этаж" }).click();
    await expect(page.getByLabel("Удалить этаж 1")).toBeVisible();

    // US-09: прораб не назначен на объект — не видит его ни в списке, ни по прямой ссылке.
    const foremanCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const foreman = await foremanCtx.newPage();
    await login(foreman, LOCAL_FOREMAN.email, LOCAL_FOREMAN.password);
    await foreman.goto("/projects");
    await expect(foreman.getByText(code)).toHaveCount(0);
    await foreman.goto(page.url());
    await expect(foreman.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
    await foremanCtx.close();
  });

  test("справочник: материал создаётся и редактируется", async ({ page, isMobile }) => {
    const name = `Цемент М400 ${run}${isMobile ? "m" : "d"}`;
    await page.goto("/catalog?tab=materials");
    await page.getByRole("button", { name: "Добавить материал" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Название").fill(name);
    await dialog.getByLabel("Единица измерения").click();
    await page.getByRole("option", { name: "меш — Мешок" }).click();
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Изменить: ${name}` }).click();
    await page.getByRole("dialog").getByLabel("Категория").fill("Сыпучие");
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
    await expect(
      page.getByRole("row", { name: new RegExp(name) }).getByText("Сыпучие"),
    ).toBeVisible();
  });

  test("журнал аудита показывает изменения", async ({ page }) => {
    // Своё изменение, чтобы не зависеть от порядка параллельных тестов.
    const name = `Поставщик аудита ${run}${test.info().project.name}`;
    await page.goto("/catalog?tab=suppliers");
    await page.getByRole("button", { name: "Добавить поставщика" }).click();
    await page.getByRole("dialog").getByLabel("Название").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "Журнал аудита" })).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row.getByText("Создание")).toBeVisible();
    await expect(row.getByText("Локальный администратор")).toBeVisible();
  });
});
