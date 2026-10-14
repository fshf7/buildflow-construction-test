import { describe, expect, it } from "vitest";

import { parseSheet } from "./parse";

describe("parseSheet", () => {
  it("заголовки в любом порядке и регистре, пустые строки пропускаются, номера строк как в Excel", () => {
    const r = parseSheet("materials", [
      [null, null],
      ["единица", " НАЗВАНИЕ ", "Категория"],
      ["меш", "  Цемент   М400 ", "Сыпучие"],
      [null, null, null],
      ["т", "Песок", null],
    ]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { row: 3, name: "Цемент М400", unit_code: "меш", code: "", category: "Сыпучие" },
      { row: 5, name: "Песок", unit_code: "т", code: "", category: "" },
    ]);
  });
  it("число в ИНН — без «.0», дата — в ISO", () => {
    const r = parseSheet("suppliers", [
      ["Название", "ИНН", "Адрес"],
      ["ООО", 123456789, new Date("2026-01-05T00:00:00Z")],
    ]);
    expect(r.rows[0]).toMatchObject({ tax_id: "123456789", address: "2026-01-05" });
  });
  it("нет обязательной колонки — понятная ошибка", () => {
    const r = parseSheet("materials", [["Название"], ["Цемент"]]);
    expect(r.errors[0]?.message).toMatch(/Единица/);
  });
  it("пустое обязательное поле — ошибка строки", () => {
    const r = parseSheet("crews", [
      ["Название", "Бригадир"],
      [null, "Каримов"],
    ]);
    expect(r.errors).toEqual([{ row: 2, message: "не заполнено «Название»" }]);
  });
  it("пустой файл", () => expect(parseSheet("crews", []).errors[0]?.message).toBe("Файл пустой"));
});
