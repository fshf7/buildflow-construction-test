import { expect, test } from "@playwright/test";

import { ACCOUNTANT_STATE, CASHIER_STATE, LOCAL_STOREKEEPER, login } from "./helpers/accounts";
import { fillInvoice, saveInvoice } from "./helpers/expenses";
import { createWarehouseFixture } from "./helpers/fixture";

// Д-99: накладная из многих строк как в Excel → журнал накладных с номером → «Затраты» только для
// просмотра → долг поставщику у кассира; исправление до оплаты; склад — без цен.
test("накладная: ввод и вставка строк → журнал → затраты → долг; склад без цен", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "накладная — рабочее место бухгалтера (десктоп)");
  test.setTimeout(120_000);
  const fx = await createWarehouseFixture();
  const base = `/objects/${fx.projectId}/procurement`;

  const accCtx = await browser.newContext({ storageState: ACCOUNTANT_STATE });
  const acc = await accCtx.newPage();
  await acc.goto(`${base}/invoices/new`);
  // Строка вручную: 29 × 30 = 870 (свободное наименование — единицу выбирают).
  await fillInvoice(acc, fx.s1, [
    {
      description: "Гипс штукатурный",
      category: "Конструктив",
      quantity: "29",
      unit: "меш",
      price: "30",
    },
  ]);
  // Ещё две строки — вставкой из Google Таблиц (формат накладной, табами).
  const tsv = [
    "Кирпич М150\tКонструктив\t300\tшт\t0,97",
    "Доставка\tТранспортировка\t1\tшт\t500",
  ].join("\n");
  const empty = acc.getByLabel("Наименование, строка 2");
  await empty.focus();
  await empty.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  }, tsv);
  await expect(acc.getByLabel("Наименование, строка 3")).toHaveValue("Доставка");
  await expect(acc.getByRole("row", { name: /Итого/ })).toContainText("1 661,00 смн");
  const number = await saveInvoice(acc);
  const row = acc.getByRole("row", { name: new RegExp(number) });
  await expect(row).toContainText("1 661,00");
  await expect(row).toContainText("Долг");

  // Затраты: строки накладной, только чтение, без «Оплаты».
  await acc.getByRole("link", { name: "Затраты" }).click();
  await expect(acc.getByText(/Строк: 3/)).toContainText("1 661,00 смн");
  await expect(acc.getByRole("columnheader", { name: "Оплата" })).toHaveCount(0);
  await expect(acc.getByRole("textbox")).toHaveCount(0);

  // Исправление до оплаты: доставка 400 вместо 500 — номер тот же, сумма 1 561.
  await acc.getByRole("link", { name: number }).first().click();
  await acc.getByRole("link", { name: "Исправить" }).click();
  await acc.getByLabel("Цена, строка 3").fill("400");
  await acc.getByRole("button", { name: `Сохранить ${number}` }).click();
  await expect(acc.getByRole("row", { name: new RegExp(number) })).toContainText("1 561,00");
  await accCtx.close();

  // Кассир: долг поставщику по объекту.
  const cashCtx = await browser.newContext({ storageState: CASHIER_STATE });
  const cash = await cashCtx.newPage();
  await cash.goto(`/objects/${fx.projectId}/finance/pay`);
  await expect(cash.getByRole("link", { name: new RegExp(fx.s1) })).toContainText(/1\s561,00 TJS/);
  await cashCtx.close();

  // Склад: журнал и затраты без цен и сумм, «Новой накладной» нет.
  const whCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const wh = await whCtx.newPage();
  await login(wh, LOCAL_STOREKEEPER.email, LOCAL_STOREKEEPER.password);
  await wh.goto(`${base}/invoices`);
  await expect(wh.getByRole("link", { name: number })).toBeVisible();
  await expect(wh.getByRole("columnheader", { name: "Сумма" })).toHaveCount(0);
  await expect(wh.getByRole("link", { name: "Новая накладная" })).toHaveCount(0);
  await wh.goto(`${base}/expenses`);
  await expect(wh.getByText("Кирпич М150")).toBeVisible();
  await expect(wh.getByRole("columnheader", { name: "Цена за ед." })).toHaveCount(0);
  await whCtx.close();
});
