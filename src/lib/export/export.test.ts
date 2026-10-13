import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Column } from "@/features/reports/definitions";

import { toCsv } from "./csv";
import { toXlsx } from "./xlsx";

const columns: Column[] = [
  { key: "name", label: "Контрагент", kind: "text" },
  { key: "date", label: "Дата", kind: "date" },
  { key: "amount", label: "Сумма", kind: "money", total: true },
  { key: "qty", label: "Объём", kind: "qty" },
];
const rows = [
  { name: "Бригада; «Восток»", date: "2026-10-12", amount: 150000, qty: 5000 },
  { name: "=HYPERLINK()", date: null, amount: 0.1, qty: 12.5 },
];
const totals = { amount: 150000.1 };

describe("toCsv", () => {
  const csv = toCsv(columns, rows, totals);
  it("BOM, «;» и десятичная запятая для русского Excel", () => {
    expect(csv.startsWith("﻿Контрагент;Дата;Сумма;Объём\r\n")).toBe(true);
    expect(csv).toContain('"Бригада; «Восток»";12.10.2026;150000,00;5000\r\n');
    expect(csv).toContain(";0,10;12,5\r\n");
  });
  it("формулы экранируются", () => expect(csv).toContain("'=HYPERLINK()"));
  it("итоговая строка", () => expect(csv).toContain("Итого;;150000,10;\r\n"));
});

describe("toXlsx", () => {
  it("открывается и содержит те же суммы числами", async () => {
    const buf = await toXlsx("Долги", columns, rows, totals);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Долги")!;
    expect(ws.getRow(1).getCell(1).value).toBe("Контрагент");
    expect(ws.getRow(2).getCell(3).value).toBe(150000);
    expect(ws.getRow(2).getCell(2).value).toEqual(new Date("2026-10-12T00:00:00Z"));
    expect(ws.getRow(4).getCell(1).value).toBe("Итого");
    expect(ws.getRow(4).getCell(3).value).toBe(150000.1);
  });
});
