import { describe, expect, it } from "vitest";

import { workActSchema } from "./schemas";

const base = {
  id: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  crewId: crypto.randomUUID(),
  docDate: "2026-10-12",
  periodFrom: "",
  periodTo: "",
  note: "",
  lines: [{ workType: "Фасад", blockId: "", floorId: "", quantity: "5000", note: "" }],
};

describe("workActSchema", () => {
  it("принимает объём с запятой", () => {
    expect(
      workActSchema.safeParse({ ...base, lines: [{ ...base.lines[0], quantity: "12,5" }] }).success,
    ).toBe(true);
  });
  it("без строк — ошибка", () => {
    const r = workActSchema.safeParse({ ...base, lines: [] });
    expect(r.success).toBe(false);
  });
  it("нулевой объём и период наоборот — ошибка", () => {
    expect(
      workActSchema.safeParse({ ...base, lines: [{ ...base.lines[0], quantity: "0" }] }).success,
    ).toBe(false);
    expect(
      workActSchema.safeParse({ ...base, periodFrom: "2026-10-10", periodTo: "2026-10-01" })
        .success,
    ).toBe(false);
  });
});
