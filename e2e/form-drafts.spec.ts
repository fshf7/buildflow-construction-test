import { expect, test } from "@playwright/test";

import { LOCAL_STOREKEEPER, login, logout } from "./helpers/accounts";
import { createWarehouseFixture } from "./helpers/fixture";

// Несохранённый ввод не теряется при уходе в другой раздел (интервью с бухгалтером, правка 2).
test("заявка: ушёл в «Склад» и вернулся — строки на месте; после сохранения форма пустая", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "проверка поведения формы, не вёрстки");
  const fx = await createWarehouseFixture();
  const ctx = await browser.newContext({
    locale: "ru-RU",
    storageState: { cookies: [], origins: [] },
  });
  const wh = await ctx.newPage();
  await login(wh, LOCAL_STOREKEEPER.email, LOCAL_STOREKEEPER.password);

  await wh.goto(`/objects/${fx.projectId}/warehouse/requests/new`);
  await wh.getByLabel("Материал, строка 1").selectOption({ label: `${fx.cement} (кг)` });
  await wh.getByLabel("Количество, строка 1").fill("20");
  await wh.getByRole("button", { name: "Добавить строку" }).click();
  await wh.getByLabel("Материал, строка 2").selectOption({ label: `${fx.sand} (кг)` });
  await wh.getByLabel("Количество, строка 2").fill("10");

  // Переход по меню (без перезагрузки) и назад.
  await wh.getByRole("link", { name: "Склад", exact: true }).first().click();
  await wh.waitForURL(new RegExp(`/objects/${fx.projectId}/warehouse$`));
  await wh.goBack();
  await expect(wh.getByText("Восстановлен несохранённый ввод")).toBeVisible();
  await expect(wh.getByLabel("Количество, строка 1")).toHaveValue("20");
  await expect(wh.getByLabel("Количество, строка 2")).toHaveValue("10");

  // Перезагрузка — тоже на месте.
  await wh.reload();
  await expect(wh.getByLabel("Количество, строка 2")).toHaveValue("10");

  await wh.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(wh.getByRole("heading", { name: "Черновик заявки" })).toBeVisible();
  await wh.goto(`/objects/${fx.projectId}/warehouse/requests/new`);
  await expect(wh.getByLabel("Количество, строка 1")).toHaveValue("");
  await expect(wh.getByText("Восстановлен несохранённый ввод")).toHaveCount(0);

  // Выход стирает несохранённый ввод с устройства.
  await wh.getByLabel("Количество, строка 1").fill("7");
  await wh.waitForTimeout(600);
  await logout(wh);
  const left = await wh.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("bf.draft.")),
  );
  expect(left).toEqual([]);
  await ctx.close();
});
