import { devices, expect, test, type Browser } from "@playwright/test";

import {
  CASHIER_STATE,
  LOCAL_PM,
  LOCAL_STOREKEEPER,
  login,
  selectByText,
} from "./helpers/accounts";
import { createWorkFixture } from "./helpers/fixture";

const phone = devices["Pixel 7"];

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

// BP-06 на смартфоне: управляющий ставит задачи складу и кассиру; просрочка подсвечена;
// исполнитель берёт в работу и сдаёт на проверку, блокировка — с причиной; управляющий принимает.
test("задачи: управляющий → склад и кассир (смартфон)", async ({ browser, isMobile }) => {
  test.skip(!isMobile, "сценарий ролей на смартфоне (US-10) — один раз, в мобильном проекте");
  test.setTimeout(120_000);
  const fx = await createWorkFixture();
  const run = Date.now().toString(36);

  const pm = await onPhone(browser, LOCAL_PM);
  async function createTask(title: string, assignee: string, due: string) {
    await pm.page.goto(`/objects/${fx.projectId}/tasks/new`);
    await pm.page.getByLabel("Что сделать").fill(title);
    await selectByText(pm.page, "Исполнитель", assignee);
    await pm.page.getByLabel("Срок").fill(due);
    await pm.page.getByRole("button", { name: "Создать задачу" }).click();
    await expect(pm.page.getByRole("heading", { name: title })).toBeVisible();
    return pm.page.url();
  }
  const whTask = `Принять арматуру ${run}`;
  const whUrl = await createTask(whTask, "Кладовщик Демо", "2026-01-10");
  const cashTask = `Оплатить кран ${run}`;
  const cashUrl = await createTask(cashTask, "Кассир Демо", "2099-12-31");

  // ---- Склад: видит свою просроченную задачу, блокирует с причиной, затем сдаёт ----
  const wh = await onPhone(browser, LOCAL_STOREKEEPER);
  await wh.page.goto(`/objects/${fx.projectId}/tasks`);
  const card = wh.page.getByRole("link", { name: new RegExp(whTask) });
  await expect(card).toContainText("Просрочена");
  await expect(wh.page.getByRole("link", { name: new RegExp(cashTask) })).toHaveCount(0);
  await card.click();
  await wh.page.getByRole("button", { name: "Взять в работу" }).click();
  await expect(wh.page.getByText("В работе", { exact: true })).toBeVisible();
  await wh.page.getByRole("button", { name: "Заблокирована" }).click();
  await wh.page.getByLabel("Причина").fill("Нет крана");
  await wh.page.getByRole("dialog").getByRole("button", { name: "Заблокирована" }).click();
  await expect(wh.page.getByText("Причина блокировки:")).toBeVisible();
  await wh.page.getByRole("button", { name: "Снять блокировку" }).click();
  await wh.page.getByRole("button", { name: "Готово — на проверку" }).click();
  await expect(wh.page.getByText("На проверке", { exact: true })).toBeVisible();
  await expect(wh.page.getByRole("button", { name: "Принять — выполнена" })).toHaveCount(0);

  // ---- Кассир: своя задача в работу ----
  const cash = await onPhone(browser, { state: CASHIER_STATE });
  await cash.page.goto(cashUrl);
  await cash.page.getByRole("button", { name: "Взять в работу" }).click();
  await expect(cash.page.getByText("В работе", { exact: true })).toBeVisible();
  await cash.page.goto(whUrl);
  await expect(cash.page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();

  // ---- Управляющий принимает ----
  await pm.page.goto(whUrl);
  await pm.page.getByRole("button", { name: "Принять — выполнена" }).click();
  await expect(pm.page.getByText("Выполнена", { exact: true }).first()).toBeVisible();

  for (const r of [pm, wh, cash]) await r.ctx.close();
});
