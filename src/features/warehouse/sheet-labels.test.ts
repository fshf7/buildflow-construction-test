import { describe, expect, it } from "vitest";

import { incomingBasis, incomingSearch, outgoingName } from "./sheet-labels";

const row = (kind: "receipt" | "opening", requestNumber: string | null) => ({
  kind,
  number: kind === "opening" ? "ВО-2026-000002" : "ПРМ-2026-000001",
  requestNumber,
  draft: { materialName: "Цемент М400" },
});

describe("подписи таблиц склада (Д-103)", () => {
  it("основание прихода: начальный остаток, заявка или пусто", () => {
    expect(incomingBasis(row("opening", null))).toBe("Начальный остаток · ВО-2026-000002");
    expect(incomingBasis(row("receipt", "ЗК-2026-000001"))).toBe("Заявка ЗК-2026-000001");
    expect(incomingBasis(row("receipt", null))).toBe("");
  });

  it("поиск находит начальный остаток по словам строки", () => {
    expect(incomingSearch(row("opening", null)).toLowerCase()).toContain("начальный остаток");
  });

  it("возврат в расходе подписан", () => {
    expect(outgoingName({ kind: "return", materialName: "Цемент", issueNumber: "ВДЧ-1" })).toBe(
      "↩ Возврат: Цемент",
    );
    expect(outgoingName({ kind: "issue", materialName: "Цемент", issueNumber: null })).toBe(
      "Цемент",
    );
  });
});
