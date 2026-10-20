import { devices, expect, test } from "@playwright/test";

import { ACCOUNTANT_STATE, CASHIER_STATE, selectByText } from "./helpers/accounts";
import { createCashAccount, createWarehouseFixture } from "./helpers/fixture";

// Фаза 3 (US-05, US-06): ввод остатка кассы → накладная 150 000 → кассир с телефона платит 60 000 →
// долг 90 000 → переплата запрещена → сторно оплаты восстанавливает долг.
test("частичная оплата долга поставщику и сторно", async ({ browser, isMobile }) => {
  test.skip(isMobile, "один сквозной сценарий; кассир внутри теста — на смартфоне");
  test.setTimeout(120_000);
  const fx = await createWarehouseFixture();
  const account = `Касса ${Date.now().toString(36)}`;
  await createCashAccount(account);

  // ---- Бухгалтер: начальный баланс кассы документом «Ввод остатков» (Д-61) ----
  const accCtx = await browser.newContext({ storageState: ACCOUNTANT_STATE });
  const acc = await accCtx.newPage();
  await acc.goto("/opening/new?kind=CASH");
  await acc.getByLabel("Касса 1").selectOption({ label: `${account} (TJS)` });
  await acc.getByLabel("Сумма 1").fill("200000");
  await acc.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(acc.getByRole("heading", { name: "Ввод остатков (черновик)" })).toBeVisible();
  await acc.getByRole("button", { name: "Провести" }).click();
  await expect(acc.getByRole("heading", { name: /^Ввод остатков ВО-/ })).toBeVisible();

  // ---- Бухгалтер: накладная на 150 000 → подтверждение → обязательство ----
  await acc.goto(`/objects/${fx.projectId}/procurement/invoices/new`);
  await acc.getByLabel("Поставщик", { exact: true }).selectOption({ label: fx.s1 });
  await acc.getByLabel("№ накладной поставщика").fill(`Ф-${Date.now()}`);
  await acc.getByLabel("Дата накладной").fill("2026-10-15");
  await acc.getByLabel("Материал, строка 1").selectOption({ label: `${fx.cement} (кг)` });
  await acc.getByLabel("Количество, строка 1").fill("100000");
  await acc.getByLabel("Цена, строка 1").fill("1,5");
  await acc.getByRole("button", { name: "Сохранить" }).click();
  await acc.getByRole("button", { name: "На проверку" }).click();
  await acc.getByRole("button", { name: "Подтвердить" }).click();
  await expect(acc.getByText(/К оплате: 150\s000,00 TJS/)).toBeVisible();

  // ---- US-06: кассир с телефона платит 60 000 и видит остаток долга ----
  const cashCtx = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ru-RU",
    storageState: CASHIER_STATE,
  });
  const cash = await cashCtx.newPage();
  await cash.goto(`/objects/${fx.projectId}/finance/cash`);
  await expect(cash.getByRole("link", { name: new RegExp(account) })).toContainText(
    /200\s000,00 TJS/,
  );
  await cash.getByRole("link", { name: "Оплатить долг" }).click();
  await cash.getByRole("link", { name: new RegExp(fx.s1) }).click();
  await cash.getByLabel(/^Оплатить: Накладная/).fill("60000");
  await expect(cash.getByTestId("pay-total")).toHaveText(/60\s000,00 TJS/);
  await expect(cash.getByTestId("debt-after")).toHaveText(/90\s000,00 TJS/);
  await selectByText(cash, "Из кассы / со счёта", account);
  await cash.getByRole("button", { name: "Провести оплату" }).click();
  await expect(cash.getByRole("heading", { name: /^Расход РКО-/ })).toBeVisible();
  await expect(cash.getByText(/Остаток долга сейчас: 90\s000,00 TJS/)).toBeVisible();
  const paymentUrl = cash.url();

  // Переплата запрещена (ошибка с остатком долга).
  await cash.goto(`/objects/${fx.projectId}/finance/pay`);
  await cash.getByRole("link", { name: new RegExp(fx.s1) }).click();
  await cash.getByLabel(/^Оплатить: Накладная/).fill("90000,01");
  await selectByText(cash, "Из кассы / со счёта", account);
  await cash.getByRole("button", { name: "Провести оплату" }).click();
  await expect(
    cash
      .getByRole("alert")
      .filter({ hasText: /Сумма больше долга: осталось оплатить 90\s000,00 TJS/ }),
  ).toBeVisible();

  // ---- US-05: бухгалтер видит долг 90 000 с учётом частичной оплаты ----
  await acc.goto(`/objects/${fx.projectId}/finance/payables`);
  await expect(acc.getByRole("row", { name: new RegExp(fx.s1) })).toContainText(/90\s000,00 TJS/);

  // ---- Д-67: кассир запрашивает сторно, бухгалтер согласует → долг и баланс восстановлены ----
  await cash.goto(paymentUrl);
  await cash.getByRole("button", { name: "Запросить сторно" }).click();
  await cash.getByLabel("Причина").fill("Ошибочная оплата");
  await cash.getByRole("dialog").getByRole("button", { name: "Запросить сторно" }).click();
  await expect(cash.getByText("Сторно запрошено")).toBeVisible();
  await expect(cash.getByRole("button", { name: "Согласовать сторно" })).toHaveCount(0); // сам — не проводит
  await acc.goto(paymentUrl);
  await acc.getByRole("button", { name: "Согласовать сторно" }).click();
  await expect(acc.getByText("Сторнирована", { exact: true })).toBeVisible();
  await acc.goto(`/objects/${fx.projectId}/finance/payables`);
  await expect(acc.getByRole("row", { name: new RegExp(fx.s1) })).toContainText(/150\s000,00 TJS/);
  await cash.goto(`/objects/${fx.projectId}/finance/cash`);
  await expect(cash.getByRole("link", { name: new RegExp(account) })).toContainText(
    /200\s000,00 TJS/,
  );

  // Отчёт «Сторно за период»: кто инициировал и кто согласовал.
  await acc.goto("/finance/reversals");
  const reportRow = acc.getByRole("row", { name: new RegExp(fx.s1) }).first();
  await expect(reportRow).toContainText("Ошибочная оплата");
  await expect(reportRow).toContainText("Кассир Демо");
  await expect(reportRow).toContainText("Бухгалтер Демо");

  await cashCtx.close();
  await accCtx.close();
});
