import { describe, expect, it } from "vitest";

import { changedFields, eventDetails, recordTitle } from "./labels";

describe("журнал аудита", () => {
  it("изменённые поля без служебных", () => {
    expect(
      changedFields(
        { name: "А", address: null, updated_at: "1" },
        { name: "Б", address: null, updated_at: "2" },
      ),
    ).toEqual(["название"]);
  });
  it("для INSERT/DELETE списка нет", () => {
    expect(changedFields(null, { name: "А" })).toEqual([]);
  });
  it("поля документов — по-русски", () => {
    expect(
      changedFields({ status: "DRAFT", number: null }, { status: "POSTED", number: "ПРМ-1" }),
    ).toEqual(["статус", "номер"]);
  });
  it("заголовок записи", () => {
    expect(recordTitle({ full_name: "Иванов", email: "i@x" })).toBe("Иванов");
    expect(recordTitle({ number: "НК-2026-000001", status: "CONFIRMED" })).toBe("НК-2026-000001");
    expect(recordTitle({ x: 1 })).toBeNull();
  });
});

describe("события", () => {
  it("сброс пароля показывает причину (без пароля)", () => {
    expect(eventDetails("PASSWORD_RESET", { reason: "Забыл пароль", via: "app" })).toBe(
      "Причина: Забыл пароль",
    );
  });

  it("сброс MFA показывает причину и способ", () => {
    expect(eventDetails("MFA_RESET", { reason: "Потерян телефон", via: "script" })).toBe(
      "Причина: Потерян телефон (серверный скрипт)",
    );
    expect(eventDetails("UPDATE", { name: "x" })).toBeNull();
  });
});
