import { readFile } from "node:fs/promises";

import { devices, expect, test, type Browser } from "@playwright/test";
import ExcelJS from "exceljs";

import {
  ACCOUNTANT_STATE,
  CASHIER_STATE,
  LOCAL_FOREMAN,
  LOCAL_PM,
  LOCAL_PM2,
  login,
  selectByText,
} from "./helpers/accounts";
import { createCashAccount, createWorkFixture } from "./helpers/fixture";

const phone = devices["Pixel 7"];

/** Роль на смартфоне (US-10): сохранённая сессия (MFA) или вход паролем. */
async function onPhone(
  browser: Browser,
  who: { state: string } | { email: string; password: string },
) {
  const ctx = await browser.newContext({
    ...phone,
    ...("state" in who ? { storageState: who.state } : {}),
  });
  const page = await ctx.newPage();
  if ("email" in who) await login(page, who.email, who.password);
  return { ctx, page };
}

// Фаза 4 (BP-05, US-07, US-08, US-10): прораб с телефона составляет акт 5 000 м² × 30 = 150 000 →
// управляющий утверждает → кассир платит 60 000 → долг 90 000 → бухгалтер видит отчёт и выгружает XLSX.
// Отклонённый акт кассиру не виден; управляющий чужого объекта акт не видит.
test("акт работ: прораб → управляющий → кассир → отчёт (смартфон)", async ({
  browser,
  isMobile,
}) => {
  test.skip(!isMobile, "сценарий ролей на смартфоне (US-10) — один раз, в мобильном проекте");
  test.setTimeout(180_000);
  const fx = await createWorkFixture();
  const account = `Касса работ ${Date.now().toString(36)}`;
  await createCashAccount(account);

  // ---- Бухгалтер: деньги в кассе (ввод остатков) ----
  const acc = await onPhone(browser, { state: ACCOUNTANT_STATE });
  await acc.page.goto("/opening/new?kind=CASH");
  await acc.page.getByLabel("Касса 1").selectOption({ label: `${account} (TJS)` });
  await acc.page.getByLabel("Сумма 1").fill("200000");
  await acc.page.getByRole("button", { name: "Сохранить черновик" }).click();
  await acc.page.getByRole("button", { name: "Провести" }).click();
  await expect(acc.page.getByRole("heading", { name: /^Ввод остатков ВО-/ })).toBeVisible();

  // ---- Прораб: акт 5 000 м² × 30 ----
  const fm = await onPhone(browser, LOCAL_FOREMAN);
  async function newAct(workType: string, qty: string) {
    await fm.page.goto(`/objects/${fx.projectId}/acts/new`);
    await fm.page.getByLabel("Бригада").selectOption({ label: fx.crew });
    await selectByText(fm.page, "Вид работ 1", workType);
    await fm.page.getByLabel("Объём 1").fill(qty);
    await fm.page.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(fm.page.getByRole("heading", { name: "Акт (черновик)" })).toBeVisible();
    await fm.page.getByRole("button", { name: "Отправить управляющему" }).click();
    await expect(fm.page.getByRole("heading", { name: /^Акт АКТ-/ })).toBeVisible();
    return fm.page.url();
  }
  await fm.page.goto(`/objects/${fx.projectId}/acts/new`);
  await fm.page.getByLabel("Бригада").selectOption({ label: fx.crew });
  await selectByText(fm.page, "Вид работ 1", "Фасад");
  await fm.page.getByLabel("Объём 1").fill("5000");
  await expect(fm.page.getByTestId("act-total")).toHaveText(/150\s000,00 TJS/);
  const actUrl = await newAct("Фасад", "5000");
  await expect(fm.page.getByText("Проверка", { exact: true })).toBeVisible();
  // Автор свой акт не утверждает — кнопки нет (и БД не даст).
  await expect(fm.page.getByRole("button", { name: "Утвердить" })).toHaveCount(0);
  const badUrl = await newAct("Штукатурка", "100");

  // ---- Управляющий чужого объекта: акт не виден ----
  const pm2 = await onPhone(browser, LOCAL_PM2);
  await pm2.page.goto(actUrl);
  await expect(pm2.page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  await pm2.ctx.close();

  // ---- Управляющий: утверждает первый, отклоняет второй ----
  const pm = await onPhone(browser, LOCAL_PM);
  await pm.page.goto(actUrl);
  await pm.page.getByRole("button", { name: "Утвердить" }).click();
  await expect(pm.page.getByText("Утверждён", { exact: true })).toBeVisible();
  await pm.page.goto(badUrl);
  await pm.page.getByRole("button", { name: "Отклонить" }).click();
  await pm.page.getByLabel("Что не так").fill("Объём завышен");
  await pm.page.getByRole("dialog").getByRole("button", { name: "Отклонить" }).click();
  await expect(pm.page.getByText("Отклонён", { exact: true })).toBeVisible();
  const badNumber = (await pm.page
    .getByRole("heading", { name: /^Акт АКТ-/ })
    .textContent())!.replace("Акт ", "");

  // ---- Кассир: видит только утверждённый, платит 60 000 → долг 90 000 ----
  const cash = await onPhone(browser, { state: CASHIER_STATE });
  await cash.page.goto(`/objects/${fx.projectId}/acts`);
  await expect(cash.page.getByRole("link", { name: new RegExp(fx.crew) })).toHaveCount(1);
  await expect(cash.page.getByText(badNumber)).toHaveCount(0);
  await cash.page.goto(badUrl);
  await expect(cash.page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  await cash.page.goto(`/objects/${fx.projectId}/finance/pay`);
  await cash.page.getByRole("link", { name: new RegExp(fx.crew) }).click();
  await cash.page.getByRole("textbox", { name: /^Оплатить:/ }).fill("60000");
  await selectByText(cash.page, "Из кассы / со счёта", account);
  await expect(cash.page.getByTestId("debt-after")).toHaveText(/90\s000,00 TJS/);
  await cash.page.getByRole("button", { name: "Провести оплату" }).click();
  await expect(cash.page.getByRole("heading", { name: /^Расход РКО-/ })).toBeVisible();
  await cash.page.goto(actUrl);
  await expect(cash.page.getByTestId("act-debt")).toHaveText(/90\s000,00 TJS/);

  // ---- Управляющий: отмена акта с оплатой недоступна ----
  await pm.page.goto(actUrl);
  await expect(pm.page.getByRole("button", { name: "Отменить акт" })).toHaveCount(0);

  // ---- Бухгалтер: отчёт долгов бригадам и XLSX с теми же суммами ----
  await acc.page.goto(`/reports/payables?kind=CREW&project=${fx.projectId}`);
  const row = acc.page.getByRole("row", { name: new RegExp(fx.crew) });
  await expect(row).toContainText(/150\s000,00/);
  await expect(row).toContainText(/90\s000,00/);
  const [download] = await Promise.all([
    acc.page.waitForEvent("download"),
    acc.page.getByRole("link", { name: "Excel" }).click(),
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile(await download.path())) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  const header = (ws.getRow(1).values as unknown[]).map(String);
  const col = (name: string) => header.indexOf(name);
  expect(ws.getRow(2).getCell(col("Сумма")).value).toBe(150000);
  expect(ws.getRow(2).getCell(col("Оплачено")).value).toBe(60000);
  expect(ws.getRow(2).getCell(col("Остаток долга")).value).toBe(90000);

  // ---- Прораб: «Создать на основе» отклонённого ----
  await fm.page.goto(badUrl);
  await expect(fm.page.getByText("Объём завышен")).toBeVisible();
  await fm.page.getByRole("button", { name: "Создать на основе" }).click();
  await expect(fm.page.getByRole("heading", { name: "Черновик акта" })).toBeVisible();
  await expect(fm.page.getByLabel("Объём 1")).toHaveValue("100");

  for (const r of [acc, fm, pm, cash]) await r.ctx.close();
});
