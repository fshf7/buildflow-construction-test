import { describe, expect, it } from "vitest";

import { daysBefore, filterSheetRows } from "./filter";

const rows = [
  { d: "2026-07-01", s: "Цемент Бахтиёр бетоншик" },
  { d: "2026-07-02", s: "Химдобавка Часур кл" },
  { d: "2026-07-03", s: "Цемент Панорама" },
];

describe("таблицы склада (Д-100)", () => {
  it("фильтр: период и поиск без учёта регистра", () => {
    const pick = (f: Parameters<typeof filterSheetRows>[1]) =>
      filterSheetRows(
        rows,
        f,
        (r) => r.d,
        (r) => r.s,
      ).map((r) => r.d);
    expect(pick({})).toHaveLength(3);
    expect(pick({ from: "2026-07-02" })).toEqual(["2026-07-02", "2026-07-03"]);
    expect(pick({ to: "2026-07-01" })).toEqual(["2026-07-01"]);
    expect(pick({ text: "цемент" })).toEqual(["2026-07-01", "2026-07-03"]);
  });

  it("окно исправления: 7 дней назад, через границу месяца", () => {
    expect(daysBefore("2026-10-21", 7)).toBe("2026-10-14");
    expect(daysBefore("2026-03-03", 7)).toBe("2026-02-24");
  });
});
