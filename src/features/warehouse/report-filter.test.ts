import { describe, expect, it } from "vitest";

import { distinct, filterReport, outgoingStatus, parseReportParams } from "./report-filter";
import type { WarehouseReport } from "./sheets";

const out = (
  material: string,
  block: string,
  stage: string,
  quantity: number,
  norm: number | null,
) => ({
  material,
  unit: "меш",
  block,
  floor: "1",
  stage,
  quantity,
  norm,
  normIssued: norm === null ? null : quantity,
});

const report: WarehouseReport = {
  incoming: [
    { material: "Гвозди 100 мм", unit: "кг", quantity: 111 },
    { material: "Цемент М400", unit: "меш", quantity: 306 },
    { material: "Штукатурка", unit: "меш", quantity: 120 },
  ],
  outgoing: [
    out("Кирпич М150", "Блок А", "Кладка", 2800, 6000),
    out("Перчатки", "Блок Б", "", 10, null),
    out("Цемент М400", "Блок А", "Кладка", 45, 25),
    out("Цемент М400", "Блок Б", "", 15, null),
  ],
  balance: [
    { material: "Гвозди 100 мм", unit: "кг", incoming: 111, outgoing: 4, balance: 107 },
    { material: "Песок", unit: "м³", incoming: 28, outgoing: 28, balance: 0 },
    { material: "Цемент М400", unit: "меш", incoming: 306, outgoing: 101, balance: 205 },
  ],
  services: [
    {
      service: "Кран",
      unit: "ч",
      block: "Блок А",
      floor: "1",
      stage: "Кладка",
      crewId: "c1",
      crew: "Саидов",
      quantity: 6,
      rows: 2,
    },
    {
      service: "Кран",
      unit: "ч",
      block: "Блок Б",
      floor: "",
      stage: "",
      crewId: "c2",
      crew: "Назаров",
      quantity: 10,
      rows: 1,
    },
    {
      service: "Питание",
      unit: "чел",
      block: "",
      floor: "",
      stage: "",
      crewId: "c1",
      crew: "Саидов",
      quantity: 40,
      rows: 4,
    },
  ],
};

describe("filterReport (Д-107)", () => {
  it("без фильтров — всё как было", () => {
    expect(filterReport(report, "outgoing", {})).toEqual(report);
  });

  it("поиск по материалу без учёта регистра — только в своей вкладке", () => {
    expect(
      filterReport(report, "incoming", { q: " цемент " }).incoming.map((x) => x.quantity),
    ).toEqual([306]);
    const r = filterReport(report, "outgoing", { q: "цемент" });
    expect(r.outgoing).toHaveLength(2);
    expect(r.incoming).toHaveLength(3);
    expect(filterReport(report, "balance", { q: "ЦЕМЕНТ" }).balance.map((x) => x.balance)).toEqual([
      205,
    ]);
  });

  it("расход: блок, этап и статус норматива", () => {
    expect(filterReport(report, "outgoing", { block: "Блок Б" }).outgoing).toHaveLength(2);
    expect(filterReport(report, "outgoing", { stage: "Кладка" }).outgoing).toHaveLength(2);
    expect(
      filterReport(report, "outgoing", { status: "over" }).outgoing.map((x) => x.material),
    ).toEqual(["Цемент М400"]);
    expect(filterReport(report, "outgoing", { status: "none" }).outgoing).toHaveLength(2);
    expect(outgoingStatus({ norm: 25, normIssued: 25 })).toBe("ok");
  });

  it("сортировка: по количеству и по отклонению", () => {
    expect(
      filterReport(report, "incoming", { sort: "qty" }).incoming.map((x) => x.quantity),
    ).toEqual([306, 120, 111]);
    // Отклонение: цемент +20, кирпич −3200, без норматива — в конце.
    expect(
      filterReport(report, "outgoing", { sort: "deviation" }).outgoing.map((x) => x.material),
    ).toEqual(["Цемент М400", "Кирпич М150", "Перчатки", "Цемент М400"]);
  });

  it("остаток: единица, есть / нулевой", () => {
    expect(filterReport(report, "balance", { has: "zero" }).balance.map((x) => x.material)).toEqual(
      ["Песок"],
    );
    expect(filterReport(report, "balance", { has: "yes" }).balance).toHaveLength(2);
    expect(filterReport(report, "balance", { unit: "кг" }).balance).toHaveLength(1);
  });

  it("параметры адреса: бригада — только для расхода и только id", () => {
    const id = "992c342b-7a4c-4839-af6d-2ef1020ac8a6";
    const p = (q: Record<string, string>) => parseReportParams((k) => q[k]);
    expect(p({ view: "outgoing", crew: id }).crew).toBe(id);
    expect(p({ view: "balance", crew: id }).crew).toBeUndefined();
    expect(p({ view: "outgoing", crew: "x' or 1=1" }).crew).toBeUndefined();
    expect(p({ view: "чужое" }).view).toBe("incoming");
  });

  it("услуги (Д-110): поиск, услуга, блок, бригада, сортировка — только своя вкладка", () => {
    expect(filterReport(report, "services", { q: "кра" }).services).toHaveLength(2);
    expect(
      filterReport(report, "services", { service: "Питание" }).services.map((r) => r.quantity),
    ).toEqual([40]);
    expect(
      filterReport(report, "services", { block: "Блок Б" }).services.map((r) => r.crew),
    ).toEqual(["Назаров"]);
    expect(filterReport(report, "services", { crew: "c1" }).services).toHaveLength(2);
    expect(
      filterReport(report, "services", { sort: "qty" }).services.map((r) => r.quantity),
    ).toEqual([40, 10, 6]);
    expect(filterReport(report, "incoming", { crew: "c1" }).services).toHaveLength(3);
    const p = parseReportParams((k) => ({ view: "services", crew: "c1" })[k]);
    expect(p.filter.crew).toBe("c1");
    expect(p.crew).toBeUndefined();
  });

  it("варианты выбора — без пустых и повторов, этажи по числу", () => {
    expect(distinct(["10", "2", "", "2", "1"]).map((o) => o.value)).toEqual(["1", "2", "10"]);
  });
});
