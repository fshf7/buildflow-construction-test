import { describe, expect, it } from "vitest";

import { buildLedger, type LedgerDoc, type LedgerMovement } from "./ledger";

// Гвозди: приход 10, выдачи 3 и 2, возврат 1, приход 101 исправлен на 100 (сторно + новая приёмка).
const mv = (
  id: string,
  quantity: number,
  docType: string,
  docId: string,
  reversalOf: string | null = null,
): LedgerMovement => ({
  id,
  quantity,
  type: reversalOf ? "RECEIPT_REVERSAL" : "RECEIPT",
  occurredOn: "2026-10-29",
  docType,
  docId,
  reversalOf,
});
const movements = [
  mv("m7", 100, "GOODS_RECEIPT", "r16"),
  mv("m6", -101, "GOODS_RECEIPT", "r15", "m5"),
  mv("m5", 101, "GOODS_RECEIPT", "r15"),
  mv("m4", 1, "MATERIAL_RETURN", "ret1"),
  mv("m3", -2, "MATERIAL_ISSUE", "i2"),
  mv("m2", -3, "MATERIAL_ISSUE", "i1"),
  mv("m1", 10, "GOODS_RECEIPT", "r9"),
];
const docs = new Map<string, LedgerDoc>([
  ["r16", { number: "ПРМ-16", parentId: "r15" }],
  ["r15", { number: "ПРМ-15" }],
  ["r9", { number: "ПРМ-9" }],
  ["i1", { number: "ВДЧ-1", detail: "Саидов Фаррух (Каменщики)" }],
  ["i2", { number: "ВДЧ-2" }],
  ["ret1", { number: "ВЗВ-1" }],
]);

describe("карточка материала (Д-104)", () => {
  it("исправление — одна строка «было 101», остаток после строки сходится", () => {
    const { entries, hidden } = buildLedger(movements, docs, 106, false);
    expect(hidden).toBe(2);
    expect(entries.map((e) => [e.title, e.quantity, e.balanceAfter, e.was])).toEqual([
      ["Приёмка ПРМ-16", 100, 106, 101],
      ["Возврат ВЗВ-1", 1, 6, null],
      ["Выдача ВДЧ-2", -2, 5, null],
      ["Выдача ВДЧ-1", -3, 7, null],
      ["Приёмка ПРМ-9", 10, 10, null],
    ]);
  });

  it("полный журнал: исправленная приёмка и её сторно видны с пометками", () => {
    const { entries } = buildLedger(movements, docs, 106, true);
    expect(entries).toHaveLength(7);
    expect(entries[1]).toMatchObject({
      title: "Отмена: Приёмка ПРМ-15",
      status: "reversal",
      balanceAfter: 6,
    });
    expect(entries[2]).toMatchObject({
      title: "Приёмка ПРМ-15",
      status: "corrected",
      balanceAfter: 107,
    });
    expect(entries.at(-1)?.balanceAfter).toBe(10);
  });

  it("отмена без замены — «отменена»", () => {
    const { entries } = buildLedger(
      [mv("b", 3, "MATERIAL_ISSUE", "i9", "a"), mv("a", -3, "MATERIAL_ISSUE", "i9")],
      new Map([["i9", { number: "ВДЧ-9" }]]),
      0,
      true,
    );
    expect(entries.map((e) => e.status)).toEqual(["reversal", "cancelled"]);
  });
});
