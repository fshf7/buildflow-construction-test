import { expect, type Page } from "@playwright/test";

/**
 * Строка в журнале «Затраты» (Д-97): заполняет пустую строку внизу таблицы и уводит фокус —
 * строка сохраняется и сразу становится долгом поставщику. Наименование, совпавшее с материалом
 * справочника, само подставляет единицу.
 */
export async function addExpense(
  page: Page,
  r: {
    description: string;
    category: string;
    quantity: string;
    price: string;
    supplier: string;
    unit?: string;
  },
) {
  const rows = page.locator("tbody tr");
  // Пустая строка ввода — последняя; после ввода под ней появится следующая, поэтому — по индексу.
  const row = rows.nth((await rows.count()) - 1);
  await row.getByLabel("Наименование").fill(r.description);
  await row.getByLabel("Категория").selectOption({ label: r.category });
  await row.getByLabel("Количество").fill(r.quantity);
  if (r.unit) await row.getByLabel("Единица").selectOption({ label: r.unit });
  await row.getByLabel("Цена за единицу").fill(r.price);
  await row.getByLabel("Поставщик").selectOption({ label: r.supplier });
  const saved = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().includes("/procurement/invoices"),
  );
  await page.getByRole("heading", { name: "Затраты" }).click(); // уход со строки → сохранение
  await saved;
  await expect(row.getByLabel(/Заполните|Сохраняется/)).toHaveCount(0);
}
