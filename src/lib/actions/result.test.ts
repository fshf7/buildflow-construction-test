import { describe, expect, it } from "vitest";

import { dbErrorMessage } from "./result";

describe("dbErrorMessage", () => {
  it("минус на складе — с текущим остатком (Д-19)", () => {
    expect(
      dbErrorMessage({
        code: "P0001",
        message: "BF_NEGATIVE_STOCK",
        details:
          '{"material": "Цемент М400", "unit": "кг", "available": 6.0000, "required": 10.0000}',
      }),
    ).toBe("Недостаточно на складе: Цемент М400 — есть 6 кг, нужно 10 кг");
  });

  it("возврат больше выданного — с цифрами", () => {
    expect(
      dbErrorMessage({
        message: "BF_RETURN_EXCEEDS_ISSUED",
        details:
          '{"material": "Цемент", "unit": "кг", "issued": 15, "returned": 5, "requested": 11}',
      }),
    ).toBe(
      "Нельзя вернуть больше выданного: Цемент — выдано 15 кг, уже возвращено 5 кг, к возврату 11 кг",
    );
  });

  it("известный код без подробностей", () => {
    expect(dbErrorMessage({ message: "BF_INVALID_STATUS" })).toBe(
      "Документ уже в другом статусе — обновите страницу",
    );
  });

  it("права и неизвестное", () => {
    expect(dbErrorMessage({ code: "42501", message: "permission denied" })).toBe(
      "Недостаточно прав для этого действия",
    );
    expect(dbErrorMessage({ code: "XX000", message: "boom" })).toBe(
      "Не удалось сохранить. Попробуйте ещё раз",
    );
  });
});
