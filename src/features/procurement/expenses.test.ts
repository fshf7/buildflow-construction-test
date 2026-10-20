import { describe, expect, it } from "vitest";

import {
  filterExpenseRows,
  parsePastedRows,
  parseRuDate,
  parseRuNumber,
  totalsByCurrency,
  type ExpenseRow,
} from "./expenses";

const row = (over: Partial<ExpenseRow>): ExpenseRow => ({
  key: "k",
  invoiceId: "i",
  number: "НК-2026-000001",
  status: "CONFIRMED",
  docDate: "2026-06-01",
  description: "Профиль 8*4",
  materialId: null,
  categoryId: "c-other",
  quantity: 120,
  unitId: "u-m",
  unitCode: "м",
  price: 32,
  amount: 3840,
  currency: "TJS",
  supplierId: "s-firdavs",
  supplierName: "Фирдавс",
  docNumber: null,
  paid: 0,
  debtStatus: "OPEN",
  editable: true,
  ...over,
});

describe("журнал затрат (Д-97)", () => {
  it("даты и числа из Excel", () => {
    expect(parseRuDate("01.06.2026")).toBe("2026-06-01");
    expect(parseRuDate("1.6.26")).toBe("2026-06-01");
    expect(parseRuDate("2026-06-01")).toBe("2026-06-01");
    expect(parseRuDate("32.13.2026")).toBeNull();
    expect(parseRuNumber("3 840,00")).toBe("3840,00");
    expect(parseRuNumber("1 100")).toBe("1100");
    expect(parseRuNumber("1,234.50")).toBe("1234,50");
    expect(parseRuNumber("3,50")).toBe("3,50");
    expect(parseRuNumber("")).toBe("");
  });

  it("вставка строк как на скриншоте: справочники по названию, заголовок пропущен", () => {
    const text = [
      "Дата\tНаименование товара\tКатегория\tКол-во\tЕд. Из.\tЦена за ед.\tВалюта\tСумма\tПоставщик",
      "01.06.2026\tПрофиль 8*4\tПрочее\t120\tметр\t32,00\tсмн\t3 840,00\tФирдавс",
      "01.06.2026\tГурунч\tПродукты\t100\tкг\t11,00\tсмн\t1 100,00\tРустам Юсуф",
    ].join("\n");
    const rows = parsePastedRows(text, {
      categories: [{ id: "c-food", name: "Продукты" }],
      units: [{ id: "u-kg", name: "кг" }],
      suppliers: [{ id: "s-rustam", name: "Рустам Юсуф" }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      docDate: "2026-06-01",
      description: "Гурунч",
      categoryId: "c-food",
      quantity: "100",
      unitId: "u-kg",
      price: "11,00",
      currency: "TJS",
      supplierId: "s-rustam",
      unmatched: [],
    });
    // Неизвестные категория, единица и поставщик — не угадываются, а подсвечиваются.
    expect(rows[0]!.unmatched).toEqual(["категория «Прочее»", "ед. «метр»", "поставщик «Фирдавс»"]);
  });

  it("фильтры: период, текст, поставщик, долг; отменённые скрыты по умолчанию", () => {
    const rows = [
      row({ key: "1" }),
      row({ key: "2", docDate: "2026-07-01", supplierId: "s2", supplierName: "Рустам Юсуф" }),
      row({ key: "3", status: "CANCELLED" }),
      row({ key: "4", debtStatus: "PAID", paid: 3840 }),
    ];
    expect(filterExpenseRows(rows, {}).map((r) => r.key)).toEqual(["1", "2", "4"]);
    expect(filterExpenseRows(rows, { from: "2026-06-15" }).map((r) => r.key)).toEqual(["2"]);
    expect(filterExpenseRows(rows, { text: "рустам" }).map((r) => r.key)).toEqual(["2"]);
    expect(filterExpenseRows(rows, { pay: "debt" }).map((r) => r.key)).toEqual(["1", "2"]);
    expect(filterExpenseRows(rows, { showCancelled: true })).toHaveLength(4);
  });

  it("итоги по валютам — без отменённых и без строк без цены", () => {
    expect(
      totalsByCurrency([
        { amount: 3840, currency: "TJS", status: "CONFIRMED" },
        { amount: 1100.1, currency: "TJS", status: "CONFIRMED" },
        { amount: 500.5, currency: "USD", status: "CONFIRMED" },
        { amount: 999, currency: "TJS", status: "CANCELLED" },
        { amount: null, currency: "TJS", status: "CONFIRMED" },
      ]),
    ).toEqual([
      { currency: "TJS", total: 4940.1 },
      { currency: "USD", total: 500.5 },
    ]);
  });
});
