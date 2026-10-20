import { expect, test } from "@playwright/test";

import { ACCOUNTANT_STATE, CASHIER_STATE, LOCAL_STOREKEEPER, login } from "./helpers/accounts";
import { addExpense } from "./helpers/expenses";
import { createWarehouseFixture } from "./helpers/fixture";

// Д-97: журнал затрат как таблица Excel — ввод в ячейках, вставка строк из Google Таблиц,
// долг поставщику сразу, склад видит без цен.
test("затраты: ввод и вставка строк → долги у кассира; склад — без цен", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "таблица затрат — рабочее место бухгалтера (десктоп)");
  test.setTimeout(120_000);
  const fx = await createWarehouseFixture();
  const url = `/objects/${fx.projectId}/procurement/invoices`;

  const accCtx = await browser.newContext({ storageState: ACCOUNTANT_STATE });
  const acc = await accCtx.newPage();
  await acc.goto(url);
  await expect(acc.getByRole("heading", { name: "Затраты" })).toBeVisible();

  // Строка вручную: 120 × 32 = 3 840 (свободное наименование — единицу выбирают).
  await addExpense(acc, {
    description: "Профиль 8*4",
    category: "Прочие расходы",
    quantity: "120",
    unit: "м",
    price: "32",
    supplier: fx.s1,
  });
  await expect(acc.getByText(/Строк: 1/)).toContainText("3 840,00 смн");

  // Две строки из Google Таблиц (табами, с заголовком): сопоставляются по названиям.
  const tsv = [
    "Дата\tНаименование товара\tКатегория\tКол-во\tЕд. Из.\tЦена за ед.\tВалюта\tСумма\tПоставщик",
    `01.06.2026\tГурунч\tПродукты\t100\tкг\t11,00\tсмн\t1 100,00\t${fx.s2}`,
    `01.06.2026\tБехи\tПродукты\t143\tкг\t3,50\tсмн\t500,50\t${fx.s2}`,
  ].join("\n");
  const input = acc.locator("tbody tr").last().getByLabel("Наименование");
  await input.focus();
  await input.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  }, tsv);
  await acc.getByRole("button", { name: "Сохранить строки (2)" }).click();
  await expect(acc.getByText(/Строк: 3/)).toContainText("5 440,50 смн");

  // Фильтр по поставщику — итог только его строк.
  await acc.getByRole("button", { name: /Фильтры/ }).click();
  await acc.getByLabel("Фильтр по поставщику").selectOption({ label: fx.s2 });
  await expect(acc.getByText(/Строк: 2/)).toContainText("1 600,50 смн");
  await accCtx.close();

  // Кассир: оба поставщика с долгами по объекту.
  const cashCtx = await browser.newContext({ storageState: CASHIER_STATE });
  const cash = await cashCtx.newPage();
  await cash.goto(`/objects/${fx.projectId}/finance/pay`);
  await expect(cash.getByRole("link", { name: new RegExp(fx.s1) })).toContainText(/3\s840,00 TJS/);
  await expect(cash.getByRole("link", { name: new RegExp(fx.s2) })).toContainText(/1\s600,50 TJS/);
  await cashCtx.close();

  // Склад: та же таблица только для чтения, без цены и суммы.
  const whCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const wh = await whCtx.newPage();
  await login(wh, LOCAL_STOREKEEPER.email, LOCAL_STOREKEEPER.password);
  await wh.goto(url);
  await expect(wh.getByText("Гурунч")).toBeVisible();
  await expect(wh.getByRole("columnheader", { name: "Цена за ед." })).toHaveCount(0);
  await expect(wh.getByRole("columnheader", { name: "Сумма" })).toHaveCount(0);
  await expect(wh.getByLabel("Наименование")).toHaveCount(0);
  await whCtx.close();
});
