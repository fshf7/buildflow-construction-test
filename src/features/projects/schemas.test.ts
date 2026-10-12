import { describe, expect, it } from "vitest";

import { projectSchema } from "./schemas";

const base = { code: "P1", name: "ЖК Восток", address: "", startDate: "", endDate: "" };

describe("projectSchema", () => {
  it("принимает минимальный объект", () => {
    expect(projectSchema.safeParse(base).success).toBe(true);
  });
  it("окончание не раньше начала", () => {
    const r = projectSchema.safeParse({ ...base, startDate: "2026-05-01", endDate: "2026-04-01" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Окончание не раньше начала");
  });
  it("проверяет формат даты", () => {
    expect(projectSchema.safeParse({ ...base, startDate: "01.05.2026" }).success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("сохраняет флаг архива", async () => {
    const { updateProjectSchema } = await import("./schemas");
    const r = updateProjectSchema.parse({
      ...base,
      id: "00000000-0000-4000-8000-000000000001",
      archived: true,
    });
    expect(r.archived).toBe(true);
  });
});
