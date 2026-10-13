import { describe, expect, it } from "vitest";

import { currentRates, lineAmount, type WorkRate } from "./rates";

const base = { crewId: "c1", unitId: "u", unit: "м²", currency: "TJS" };
const rates: WorkRate[] = [
  { ...base, id: "1", projectId: null, workType: "Фасад", rate: 25, validFrom: "2026-01-01" },
  { ...base, id: "2", projectId: "p1", workType: "Фасад", rate: 30, validFrom: "2026-01-01" },
  { ...base, id: "3", projectId: "p1", workType: "Фасад", rate: 35, validFrom: "2026-10-01" },
  {
    ...base,
    id: "4",
    projectId: null,
    workType: "Штукатурка",
    rate: 12.5,
    validFrom: "2026-02-01",
  },
  { ...base, id: "5", projectId: "p2", workType: "Кладка", rate: 40, validFrom: "2026-01-01" },
];

describe("currentRates", () => {
  it("тариф объекта важнее общего, внутри — последний по дате", () => {
    const r = currentRates(rates, "c1", "p1", "2026-09-30");
    expect(r.map((x) => [x.workType, x.rate])).toEqual([
      ["Фасад", 30],
      ["Штукатурка", 12.5],
    ]);
  });
  it("новый тариф действует с даты начала", () => {
    expect(
      currentRates(rates, "c1", "p1", "2026-10-01").find((x) => x.workType === "Фасад")?.rate,
    ).toBe(35);
  });
  it("тариф другого объекта и будущий тариф не применяются", () => {
    expect(currentRates(rates, "c1", "p1", "2026-01-15").map((x) => x.workType)).toEqual(["Фасад"]);
  });
});

describe("lineAmount", () => {
  it("5 000 м² × 30 = 150 000", () => expect(lineAmount(5000, 30)).toBe(150000));
  it("округление до копеек как в БД", () => {
    expect(lineAmount(0.333, 30)).toBe(9.99);
    expect(lineAmount(1.005, 1)).toBe(1.01);
  });
});
