import { devices, expect, test } from "@playwright/test";

import { ACCOUNTANT_STATE, LOCAL_STOREKEEPER, login } from "./helpers/accounts";
import { addExpense } from "./helpers/expenses";
import { createWarehouseFixture } from "./helpers/fixture";

// Сквозной сценарий фазы 2 (US-01…US-04): склад — смартфон (заявка, приёмка, выдача, возврат),
// бухгалтер — десктоп (затраты с ценами, Д-92, Д-97).
test("заявка → приёмка 21 из 20 → выдача → минус запрещён → возврат → накладная", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "один сквозной сценарий; склад внутри теста — на смартфоне");
  test.setTimeout(120_000);
  const fx = await createWarehouseFixture();

  // ---- US-01 (Д-92): склад с телефона оформляет заявку для снабженца — без поставщиков и цен ----
  const whCtx = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ru-RU",
    storageState: { cookies: [], origins: [] },
  });
  const wh = await whCtx.newPage();
  await login(wh, LOCAL_STOREKEEPER.email, LOCAL_STOREKEEPER.password);
  await wh.goto(`/objects/${fx.projectId}/warehouse/requests/new`);
  await wh.getByLabel("Материал, строка 1").selectOption({ label: `${fx.cement} (кг)` });
  await wh.getByLabel("Количество, строка 1").fill("20");
  await expect(wh.getByLabel("Поставщик, строка 1")).toHaveCount(0);
  await expect(wh.getByLabel("Цена, строка 1")).toHaveCount(0);
  await wh.getByRole("button", { name: "Добавить строку" }).click();
  await wh.getByLabel("Материал, строка 2").selectOption({ label: `${fx.sand} (кг)` });
  await wh.getByLabel("Количество, строка 2").fill("10");
  await wh.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(wh.getByRole("heading", { name: "Черновик заявки" })).toBeVisible();
  const requestUrl = wh.url();

  await wh.getByRole("button", { name: "Выдать в работу" }).click();
  await expect(wh.getByRole("heading", { name: /^Заявка ЗК-\d{4}-\d{6}$/ })).toBeVisible();
  await expect(wh.getByText("Передана", { exact: true })).toBeVisible();
  const requestNumber = (await wh.getByRole("heading", { name: /^Заявка ЗК-/ }).textContent())!
    .replace("Заявка ", "")
    .trim();
  await wh.getByRole("link", { name: "Печать" }).click();
  await expect(wh.getByRole("heading", { name: /Заявка на закупку № ЗК-/ })).toBeVisible();
  await expect(wh.getByText("TJS")).toHaveCount(0); // печатная форма для снабженца — без цен

  // Бухгалтер заявки не оформляет (Д-92).
  const accCtx = await browser.newContext({ storageState: ACCOUNTANT_STATE });
  const acc = await accCtx.newPage();
  await acc.goto(`/objects/${fx.projectId}/warehouse/requests`);
  await expect(acc.getByRole("link", { name: "Новая заявка" })).toHaveCount(0);

  // ---- US-02: склад принимает 21 кг при заказе 20; поставщика выбирает при приёмке ----
  await wh.goto(`/objects/${fx.projectId}/warehouse`);
  await wh.getByRole("link", { name: "Принять" }).click(); // касание 1
  await wh.getByRole("link", { name: new RegExp(`Заявка ${requestNumber}`) }).click(); // касание 2
  await wh.getByLabel("Поставщик").selectOption({ label: fx.s1 });
  await wh.getByLabel(`Принято: ${fx.cement}`).fill("21");
  await wh.getByLabel(`Принято: ${fx.sand}`).fill(""); // песок этой машиной не привезли
  await wh.getByRole("button", { name: "Провести приёмку" }).click(); // касание 3
  await expect(wh.getByRole("heading", { name: /^Приёмка ПРМ-/ })).toBeVisible();
  await expect(wh.getByText("Принято 21 кг · заказано 20 кг")).toBeVisible();
  await wh.goto(`/objects/${fx.projectId}/warehouse`);
  await expect(wh.getByRole("link", { name: new RegExp(`${fx.cement}\\s*21 кг`) })).toBeVisible();

  // ---- US-03: выдача бригаде — объект, блок, этаж, бригада ----
  await wh.getByRole("link", { name: "Выдать" }).click();
  await wh.getByLabel("Бригада").selectOption({ label: fx.crew });
  await wh.getByLabel("Блок").selectOption({ label: fx.block });
  await wh.getByLabel("Этаж").selectOption({ label: fx.floor });
  await wh.getByLabel(`Выдать: ${fx.cement}`).fill("15");
  await wh.getByRole("button", { name: "Провести выдачу" }).click();
  await expect(wh.getByRole("heading", { name: /^Выдача ВДЧ-/ })).toBeVisible();
  await expect(wh.getByText(`${fx.crew} · ${fx.block}, этаж ${fx.floor}`)).toBeVisible();

  // Минус запрещён (Д-19): ошибка с текущим остатком; бригада/блок/этаж запомнились на устройстве.
  await wh.goto(`/objects/${fx.projectId}/warehouse/issue`);
  await expect(wh.getByLabel("Бригада")).toHaveValue(/.+/);
  await wh.getByLabel(`Выдать: ${fx.cement}`).fill("10");
  await wh.getByRole("button", { name: "Провести выдачу" }).click();
  await expect(
    wh
      .getByRole("alert")
      .filter({ hasText: `Недостаточно на складе: ${fx.cement} — есть 6 кг, нужно 10 кг` }),
  ).toBeVisible();

  // ---- US-04: возврат связан с выдачей ----
  await wh.goto(`/objects/${fx.projectId}/warehouse/return`);
  await wh.getByRole("link", { name: new RegExp(fx.crew) }).click();
  await wh.getByLabel(`Вернуть: ${fx.cement}`).fill("5");
  await wh.getByRole("button", { name: "Провести возврат" }).click();
  await expect(wh.getByRole("heading", { name: /^Возврат ВЗВ-/ })).toBeVisible();
  await expect(wh.getByRole("link", { name: /По выдаче ВДЧ-/ })).toBeVisible();
  await wh.goto(`/objects/${fx.projectId}/warehouse`);
  await expect(wh.getByRole("link", { name: new RegExp(`${fx.cement}\\s*11 кг`) })).toBeVisible();

  // Склад видит заявку, но без цен (§5.4).
  await wh.goto(requestUrl);
  await expect(wh.getByRole("heading", { name: /^Заявка ЗК-/ })).toBeVisible();
  await expect(wh.getByRole("columnheader", { name: "Цена" })).toHaveCount(0);
  await expect(wh.getByText("TJS")).toHaveCount(0);
  await whCtx.close();

  // ---- Д-97: бухгалтер вносит затрату по принятому в журнал «Затраты» → долг поставщику сразу ----
  await acc.goto(requestUrl);
  await expect(acc.getByText("Частично получена", { exact: true })).toBeVisible();
  await acc.getByRole("link", { name: "Внести в затраты" }).click();
  await addExpense(acc, {
    description: fx.cement,
    category: "Конструктив",
    quantity: "21",
    price: "1,5",
    supplier: fx.s1,
  });
  await expect(acc.getByText(/Строк: 1/)).toContainText("31,50 смн");
  await accCtx.close();
});
