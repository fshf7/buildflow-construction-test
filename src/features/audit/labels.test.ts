import { describe, expect, it } from "vitest";

import { changedFields, recordTitle } from "./labels";

describe("журнал аудита", () => {
  it("изменённые поля без служебных", () => {
    expect(
      changedFields(
        { name: "А", address: null, updated_at: "1" },
        { name: "Б", address: null, updated_at: "2" },
      ),
    ).toEqual(["name"]);
  });
  it("для INSERT/DELETE списка нет", () => {
    expect(changedFields(null, { name: "А" })).toEqual([]);
  });
  it("заголовок записи", () => {
    expect(recordTitle({ full_name: "Иванов", email: "i@x" })).toBe("Иванов");
    expect(recordTitle({ x: 1 })).toBeNull();
  });
});
