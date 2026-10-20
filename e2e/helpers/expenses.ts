import { expect, type Page } from "@playwright/test";

export type InvoiceLine = {
  description: string;
  category: string;
  quantity: string;
  price: string;
  /** Для свободного наименования; у материала справочника единица подставляется сама. */
  unit?: string;
};

/**
 * Заполняет «Новую накладную» (Д-99): поставщик в шапке, строки в таблице (пустая строка внизу
 * появляется сама). Сохранение — отдельно (saveInvoice).
 */
export async function fillInvoice(page: Page, supplier: string, lines: InvoiceLine[]) {
  await page.getByLabel("Поставщик", { exact: true }).selectOption({ label: supplier });
  for (const [i, l] of lines.entries()) {
    const n = i + 1;
    await page.getByLabel(`Наименование, строка ${n}`).fill(l.description);
    await page.getByLabel(`Категория, строка ${n}`).selectOption({ label: l.category });
    await page.getByLabel(`Количество, строка ${n}`).fill(l.quantity);
    if (l.unit) await page.getByLabel(`Единица, строка ${n}`).selectOption({ label: l.unit });
    await page.getByLabel(`Цена, строка ${n}`).fill(l.price);
  }
}

/** «Сохранить накладную» → журнал накладных; возвращает присвоенный номер НК. */
export async function saveInvoice(page: Page): Promise<string> {
  await page.getByRole("button", { name: /^Сохранить (накладную|НК-)/ }).click();
  await expect(page.getByRole("heading", { name: "Журнал накладных" })).toBeVisible();
  const link = page.getByRole("link", { name: /^НК-\d{4}-\d{6}$/ }).first();
  return (await link.textContent())!.trim();
}
