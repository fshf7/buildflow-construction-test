import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

import { ACCOUNTANT_STATE } from "./helpers/accounts";

test.use({ storageState: ACCOUNTANT_STATE });

async function xlsx(name: string, rows: (string | null)[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Материалы");
  for (const r of rows) ws.addRow(r);
  const file = path.join(os.tmpdir(), `${name}-${Date.now()}.xlsx`);
  await writeFile(file, Buffer.from(await wb.xlsx.writeBuffer()));
  return file;
}

// Д-85: шаблон → файл с ошибкой → предпросмотр показывает строку → исправленный файл → импорт.
test("импорт материалов из Excel", async ({ page, isMobile }) => {
  test.skip(isMobile, "импорт справочников — рабочее место бухгалтера (десктоп)");
  const run = Date.now().toString(36);
  await page.goto("/catalog/import?kind=materials");

  const [template] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Скачайте шаблон/ }).click(),
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await template.path());
  expect(wb.worksheets[0]!.getRow(1).getCell(1).value).toBe("Название");

  const bad = await xlsx("bad", [
    ["Название", "Единица", "Категория"],
    [`Гвозди ${run}`, "ящ", "Метизы"],
    [`Саморезы ${run}`, "кг", "Метизы"],
  ]);
  await page.getByLabel(/Файл Excel/).setInputFiles(bad);
  await expect(page.getByText("неизвестная единица «ящ»")).toBeVisible();
  await expect(page.getByRole("button", { name: "Импортировать" })).toBeDisabled();

  const good = await xlsx("good", [
    ["Название", "Единица", "Категория"],
    [`Гвозди ${run}`, "кг", "Метизы"],
    [`Саморезы ${run}`, "кг", "Метизы"],
  ]);
  await page.getByLabel(/Файл Excel/).setInputFiles(good);
  await expect(page.getByTestId("import-summary")).toContainText("новых 2");
  await page.getByRole("button", { name: "Импортировать" }).click();
  await expect(page.getByRole("status")).toContainText("создано 2");

  // Повтор того же файла — «уже есть», по умолчанию пропускаются.
  await page.getByLabel(/Файл Excel/).setInputFiles(good);
  await expect(page.getByTestId("import-summary")).toContainText("уже есть 2");

  await page.goto("/catalog?tab=materials");
  await expect(page.getByText(`Гвозди ${run}`)).toBeVisible();
});
