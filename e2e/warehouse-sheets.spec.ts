import { expect, test, type Page } from "@playwright/test";

import { LOCAL_PM, LOCAL_STOREKEEPER, login } from "./helpers/accounts";
import { createWarehouseFixture } from "./helpers/fixture";

/** Заполняет строку ввода вверху таблицы (Д-114) и уводит фокус — строка сохраняется (Д-100). */
async function fillNewRow(
  page: Page,
  values: [label: string, value: string, kind: "fill" | "select"][],
  heading: string,
) {
  // Строка ввода — первая; после ввода над ней появится новая пустая, поэтому — по data-entry.
  const row = page.locator("tbody tr[data-entry]").last();
  for (const [label, value, kind] of values) {
    const cell = row.getByLabel(label, { exact: true });
    if (kind === "fill") await cell.fill(value);
    else await cell.selectOption({ label: value });
  }
  await page.getByRole("heading", { name: heading }).click();
}

// Д-100: склад как их Google Таблица — приход (с новым наименованием), расход по блоку/этапу
// бригадиру, норматив управляющего, перерасход, отчёт за период; Д-103: возврат строкой с минусом.
test("склад таблицами: приход → расход → норматив → перерасход → отчёт", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "таблицы склада — проверка поведения, не вёрстки");
  test.setTimeout(150_000);
  const fx = await createWarehouseFixture();
  const run = Date.now().toString(36);
  const base = `/objects/${fx.projectId}/warehouse`;

  const whCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const wh = await whCtx.newPage();
  wh.on("dialog", (d) => void d.accept()); // «Добавить новый материал … в справочник?»
  await login(wh, LOCAL_STOREKEEPER.email, LOCAL_STOREKEEPER.password);

  // Приход: материал из справочника и новое наименование (добавится в справочник).
  await wh.goto(`${base}/incoming`);
  await fillNewRow(
    wh,
    [
      ["Наименование", fx.cement, "fill"],
      ["Количество", "100", "fill"],
    ],
    "Приход",
  );
  await expect(wh.getByText(/Строк: 1/)).toBeVisible();
  await fillNewRow(
    wh,
    [
      ["Наименование", `Гушт ${run}`, "fill"],
      ["Единица", "кг", "select"],
      ["Количество", "3", "fill"],
    ],
    "Приход",
  );
  await expect(wh.getByText(/Строк: 2/)).toBeVisible();

  // Расход: 30 цемента на блок/этаж/кладку бригадиру.
  await wh.goto(`${base}/outgoing`);
  await fillNewRow(
    wh,
    [
      ["Наименование", fx.cement, "fill"],
      ["Блок", fx.block, "select"],
      ["Этаж", fx.floor, "select"],
      ["Этап", "Кладка", "select"],
      ["Количество", "30", "fill"],
      ["Ответственный", fx.crew, "select"],
    ],
    "Расход",
  );
  await expect(wh.getByText(/Строк: 1/)).toBeVisible();

  // Управляющий: норматив 20 на цемент, блок, кладку → перерасход.
  const pmCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const pm = await pmCtx.newPage();
  await login(pm, LOCAL_PM.email, LOCAL_PM.password);
  await pm.goto(`${base}/norms`);
  await expect(pm.getByRole("row", { name: new RegExp(fx.cement) })).toContainText(
    "Норматив не задан",
  );
  const row = pm.getByRole("row", { name: new RegExp(fx.cement) });
  await row.getByLabel("Норматив").fill("20");
  await pm.getByRole("heading", { name: "Нормативы" }).click();
  await expect(pm.getByRole("row", { name: new RegExp(fx.cement) })).toContainText("Перерасход");
  await pmCtx.close();

  // Расход показывает остаток норматива −10; отчёт — перерасход и остаток 70.
  await wh.goto(`${base}/outgoing`);
  await expect(wh.locator("tbody tr:not([data-entry])").first()).toContainText(/[-−]10/);
  await wh.goto(`${base}/report`);
  await expect(wh.getByRole("row", { name: new RegExp(`${fx.cement}.*Кладка`) })).toContainText(
    "Перерасход",
  );
  await expect(
    wh
      .getByRole("row", { name: new RegExp(fx.cement) })
      .filter({ hasText: "100" })
      .last(),
  ).toContainText("70");

  // Д-103: возврат из строки «Расхода» — зелёная строка с минусом; в «Приходе» его нет.
  await wh.goto(`${base}/outgoing`);
  await wh.getByRole("button", { name: `Вернуть: ${fx.cement}` }).click();
  await wh.getByLabel("Сколько вернули").fill("5");
  await wh.getByRole("button", { name: "Провести возврат" }).click();
  await expect(wh.getByRole("row", { name: /Возврат: .*[-−]5/ })).toBeVisible();
  await wh.goto(`${base}/incoming`);
  await expect(wh.getByText(/Возврат/)).toHaveCount(0);
  await whCtx.close();
});
