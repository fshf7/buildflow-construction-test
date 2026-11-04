/**
 * Фильтры и сортировка отчёта склада (Д-107) — по строкам, которые уже вернул отчёт за период.
 * Бригада фильтруется в БД (`report_warehouse_outgoing(p_crew)`): в строках отчёта её нет.
 * Общая для страницы и выгрузки в Excel. Без "server-only": логика покрыта Vitest.
 */
import type { WarehouseReport } from "./sheets";

export type ReportView = "incoming" | "outgoing" | "balance" | "services";

export type ReportFilter = {
  q?: string;
  unit?: string;
  block?: string;
  floor?: string;
  stage?: string;
  /** Расход: over — перерасход, ok — в норме, none — без норматива. */
  status?: string;
  /** Остаток: yes — есть остаток, zero — нулевой. */
  has?: string;
  /** Услуги: название услуги из справочника. */
  service?: string;
  /** Услуги: бригада (расход фильтруется по бригаде в БД — `crew` из parseReportParams). */
  crew?: string;
  /** qty — по количеству (больше сверху), deviation — по отклонению от норматива; иначе по названию. */
  sort?: string;
};

type Outgoing = WarehouseReport["outgoing"][number];

/** Статус норматива строки: over / ok / none (норматив не задан). */
export function outgoingStatus(r: Pick<Outgoing, "norm" | "normIssued">): "over" | "ok" | "none" {
  if (r.norm === null || r.normIssued === null) return "none";
  return r.normIssued > r.norm ? "over" : "ok";
}

export const deviation = (r: Pick<Outgoing, "norm" | "normIssued">) =>
  r.norm !== null && r.normIssued !== null ? r.normIssued - r.norm : null;

const norm = (s: string) => s.trim().toLocaleLowerCase("ru");

function byName<T extends { material: string }>(rows: T[], q?: string): T[] {
  const needle = norm(q ?? "");
  return needle ? rows.filter((r) => norm(r.material).includes(needle)) : rows;
}

/** Сортировка по убыванию числа; при равенстве — исходный порядок (по названию). */
function sortDesc<T>(rows: T[], key: (r: T) => number | null): T[] {
  return [...rows].sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity));
}

/** Фильтры применяются к отчёту своей вкладки; остальные два — как есть. */
export function filterReport(
  report: WarehouseReport,
  view: ReportView,
  f: ReportFilter,
): WarehouseReport {
  if (view === "incoming") {
    let incoming = byName(report.incoming, f.q).filter((r) => !f.unit || r.unit === f.unit);
    if (f.sort === "qty") incoming = sortDesc(incoming, (r) => r.quantity);
    return { ...report, incoming };
  }
  if (view === "outgoing") {
    let outgoing = byName(report.outgoing, f.q).filter(
      (r) =>
        (!f.block || r.block === f.block) &&
        (!f.floor || r.floor === f.floor) &&
        (!f.stage || r.stage === f.stage) &&
        (!f.status || outgoingStatus(r) === f.status),
    );
    if (f.sort === "qty") outgoing = sortDesc(outgoing, (r) => r.quantity);
    if (f.sort === "deviation") outgoing = sortDesc(outgoing, deviation);
    return { ...report, outgoing };
  }
  if (view === "services") {
    const needle = norm(f.q ?? "");
    let services = report.services.filter(
      (r) =>
        (!needle || norm(r.service).includes(needle)) &&
        (!f.service || r.service === f.service) &&
        (!f.block || r.block === f.block) &&
        (!f.stage || r.stage === f.stage) &&
        (!f.crew || r.crewId === f.crew),
    );
    if (f.sort === "qty") services = sortDesc(services, (r) => r.quantity);
    return { ...report, services };
  }
  let balance = byName(report.balance, f.q).filter(
    (r) =>
      (!f.unit || r.unit === f.unit) &&
      (!f.has || (f.has === "zero" ? r.balance === 0 : r.balance !== 0)),
  );
  if (f.sort === "qty") balance = sortDesc(balance, (r) => r.balance);
  return { ...report, balance };
}

export const REPORT_VIEWS: { value: ReportView; label: string }[] = [
  { value: "incoming", label: "Приход" },
  { value: "outgoing", label: "Расход" },
  { value: "balance", label: "Остаток" },
  { value: "services", label: "Услуги" },
];

/** Вкладка и фильтры из параметров адреса (страница и выгрузка в Excel). */
export function parseReportParams(get: (key: string) => unknown): {
  view: ReportView;
  filter: ReportFilter;
  crew?: string;
} {
  const str = (k: string) => {
    const v = get(k);
    return typeof v === "string" && v ? v : undefined;
  };
  const view = REPORT_VIEWS.find((v) => v.value === str("view"))?.value ?? "incoming";
  return {
    view,
    filter: {
      q: str("q"),
      unit: str("unit"),
      block: str("block"),
      floor: str("floor"),
      stage: str("stage"),
      status: str("status"),
      has: str("has"),
      sort: str("sort"),
      service: str("service"),
      crew: view === "services" ? str("crew") : undefined,
    },
    // Бригада — только для расхода (фильтр в БД).
    crew:
      view === "outgoing" && /^[0-9a-f-]{36}$/i.test(str("crew") ?? "") ? str("crew") : undefined,
  };
}

/** Варианты выбора — из строк отчёта (без пустых), по алфавиту. */
export function distinct(values: string[]): { value: string; label: string }[] {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru", { numeric: true }))
    .map((v) => ({ value: v, label: v }));
}
