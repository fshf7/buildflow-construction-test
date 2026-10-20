import { expect, test } from "@playwright/test";

import { ACCOUNTANT_STATE } from "./helpers/accounts";
import { createWarehouseFixture } from "./helpers/fixture";

// Д-94: на главной выбирают объект (ЖК), внутри — меню и данные только этого объекта.
test("выбор объекта → главная объекта → меню только по объекту", async ({ browser, isMobile }) => {
  test.skip(isMobile, "проверка навигации, не вёрстки");
  const fx = await createWarehouseFixture();
  const projectName = fx.projectLabel.split(" — ")[1]!;
  const ctx = await browser.newContext({ storageState: ACCOUNTANT_STATE });
  const page = await ctx.newPage();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Выберите объект" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Общее по организации" })).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(projectName) })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/objects/${fx.projectId}$`));
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Разделы объекта" }).first();
  await expect(nav.getByText(fx.projectLabel)).toBeVisible();
  await expect(nav.getByRole("link", { name: "Закупки" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Участники" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Закупки" }).click();
  await expect(page).toHaveURL(new RegExp(`/objects/${fx.projectId}/procurement/invoices`));
  // Д-98: заявки склада — во вкладке раздела «Склад».
  await nav.getByRole("link", { name: "Склад", exact: true }).click();
  await page.getByRole("link", { name: "Заявки склада" }).click();
  await expect(page).toHaveURL(new RegExp(`/objects/${fx.projectId}/warehouse/requests`));

  // Объект задан адресом — в накладной его не выбирают.
  await page.goto(`/objects/${fx.projectId}/procurement/invoices/new`);
  await expect(page.getByRole("heading", { name: "Новая накладная" })).toBeVisible();
  await expect(page.getByLabel("Объект", { exact: true })).toHaveCount(0);

  // «Сменить объект» — обратно к выбору.
  await nav.getByRole("link", { name: "Сменить объект" }).click();
  await expect(page.getByRole("heading", { name: "Выберите объект" })).toBeVisible();

  // Старые адреса разделов ведут на выбор объекта; чужой или несуществующий объект — 404.
  await page.goto("/procurement/requests");
  expect(new URL(page.url()).pathname).toBe("/");
  await page.goto("/objects/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  await ctx.close();
});
