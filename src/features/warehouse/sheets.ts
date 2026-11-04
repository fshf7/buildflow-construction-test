import "server-only";

import type { SheetRow } from "@/components/sheet/use-row-sheet";
import { createClient } from "@/lib/supabase/server";

/**
 * Склад таблицами (Д-100): строки «Прихода», «Расхода», «Услуг» и «Нормативов» для таблиц как в
 * Excel. Строка таблицы = строка документа; править в ячейке можно строки однострочных документов
 * (у многострочных из «Остатков» — только просмотр). Цен здесь нет (§5.4).
 */

const num = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "" : String(Number(v)).replace(".", ",");

export type IncomingDraft = {
  docDate: string;
  materialId: string;
  materialName: string;
  unitId: string;
  quantity: string;
};
export type IncomingRow = SheetRow<IncomingDraft> & {
  /** Приёмка — строка прихода; начальный остаток — из «Ввода остатков» (только просмотр). */
  kind: "receipt" | "opening";
  number: string | null;
  unitCode: string;
  requestNumber: string | null;
};

/**
 * Исправленная строка (корректировка приёмки / сторно и новая выдача) — новый документ; чтобы она
 * осталась на месте исходной, порядок берём по времени создания первого документа цепочки.
 */
function chainStart(docs: { id: string; created_at: string; parent: string | null }[]) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const start = (id: string): string => {
    let d = byId.get(id);
    for (let i = 0; d?.parent && byId.has(d.parent) && i < 50; i++) d = byId.get(d.parent);
    return d?.created_at ?? "";
  };
  return start;
}

/** Начальный остаток + приход − расход (с возвратами) = остаток: сверка видна прямо в таблицах. */
export async function listIncomingRows(projectId: string): Promise<IncomingRow[]> {
  const supabase = await createClient();
  const [receipts, openings, chain] = await Promise.all([
    supabase
      .from("goods_receipts")
      .select(
        "id, number, doc_date, created_at, purchase_requests(number), goods_receipt_items(id, line_no, material_id, received_quantity, materials(name, unit_id, units_of_measure(code)))",
      )
      .eq("project_id", projectId)
      .eq("status", "POSTED")
      .limit(3000),
    supabase
      .from("opening_balances")
      .select(
        "id, number, doc_date, created_at, opening_stock_items(id, line_no, material_id, quantity, materials(name, unit_id, units_of_measure(code)))",
      )
      .eq("project_id", projectId)
      .eq("kind", "STOCK")
      .eq("status", "POSTED"),
    supabase
      .from("goods_receipts")
      .select("id, created_at, corrects_receipt_id")
      .eq("project_id", projectId)
      .in("status", ["POSTED", "CORRECTED"])
      .limit(5000),
  ]);
  if (chain.error) throw new Error(chain.error.message);
  const startOf = chainStart(
    chain.data.map((g) => ({ id: g.id, created_at: g.created_at, parent: g.corrects_receipt_id })),
  );
  if (receipts.error) throw new Error(receipts.error.message);
  if (openings.error) throw new Error(openings.error.message);

  const fromOpenings = openings.data.flatMap((o) =>
    [...o.opening_stock_items]
      .sort((a, b) => a.line_no - b.line_no)
      .map((i) => ({
        order: `${o.doc_date}|0|${o.created_at}|${i.line_no}`,
        row: {
          key: i.id,
          id: o.id,
          kind: "opening" as const,
          editable: false,
          number: o.number,
          unitCode: i.materials?.units_of_measure?.code ?? "",
          requestNumber: null,
          draft: {
            docDate: o.doc_date,
            materialId: i.material_id,
            materialName: i.materials?.name ?? "",
            unitId: i.materials?.unit_id ?? "",
            quantity: num(i.quantity),
          },
        },
      })),
  );
  const fromReceipts = receipts.data.flatMap((g) => {
    const items = [...g.goods_receipt_items].sort((a, b) => a.line_no - b.line_no);
    return items.map((i) => ({
      order: `${g.doc_date}|1|${startOf(g.id) || g.created_at}|${i.line_no}`,
      row: {
        key: i.id,
        id: g.id,
        kind: "receipt" as const,
        editable: items.length === 1,
        number: g.number,
        unitCode: i.materials?.units_of_measure?.code ?? "",
        requestNumber: g.purchase_requests?.number ?? null,
        draft: {
          docDate: g.doc_date,
          materialId: i.material_id,
          materialName: i.materials?.name ?? "",
          unitId: i.materials?.unit_id ?? "",
          quantity: num(i.received_quantity),
        },
      },
    }));
  });
  // В один день начальный остаток — первым.
  return [...fromOpenings, ...fromReceipts]
    .sort((a, b) => a.order.localeCompare(b.order))
    .map((x) => x.row);
}

export type OutgoingDraft = {
  docDate: string;
  materialId: string;
  quantity: string;
  blockId: string;
  floorId: string;
  stageId: string;
  crewId: string;
};
export type OutgoingRow = SheetRow<OutgoingDraft> & {
  /** Выдача — расход; возврат — строка с минусом: бригада вернула часть выданного. */
  kind: "issue" | "return";
  number: string | null;
  materialName: string;
  unitCode: string;
  /** Возвраты по выдаче — для подсказки, почему строку нельзя править. */
  hasReturns: boolean;
  /** Выдача: строка документа и сколько ещё можно вернуть (кнопка «Вернуть»). */
  issueItemId: string | null;
  returnable: number;
  /** Возврат: номер выдачи, к которой он относится. */
  issueNumber: string | null;
};

/**
 * Строки «Расхода»: выдачи и возвраты по ним (Д-103). Возврат — отдельная строка с минусом в дату
 * возврата, с блоком/этажом/этапом/бригадой своей выдачи: итог колонки — чистый расход.
 */
export async function listOutgoingRows(projectId: string): Promise<OutgoingRow[]> {
  const supabase = await createClient();
  const [{ data, error }, chain] = await Promise.all([
    supabase
      .from("material_issues")
      .select(
        "id, number, doc_date, created_at, block_id, floor_id, stage_id, crew_id, material_issue_items(id, line_no, material_id, quantity, materials(name, units_of_measure(code))), material_returns(id, number, status, doc_date, created_at, material_return_items(id, material_issue_item_id, quantity))",
      )
      .eq("project_id", projectId)
      .eq("status", "POSTED")
      .limit(3000),
    supabase
      .from("material_issues")
      .select("id, created_at, replaces_issue_id")
      .eq("project_id", projectId)
      .in("status", ["POSTED", "REVERSED"])
      .limit(5000),
  ]);
  if (error) throw new Error(error.message);
  if (chain.error) throw new Error(chain.error.message);
  const startOf = chainStart(
    chain.data.map((d) => ({ id: d.id, created_at: d.created_at, parent: d.replaces_issue_id })),
  );

  const out: { order: string; row: OutgoingRow }[] = [];
  for (const d of data) {
    const items = [...d.material_issue_items].sort((a, b) => a.line_no - b.line_no);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const returns = d.material_returns.filter((r) => r.status === "POSTED");
    const returned = new Map<string, number>();
    for (const r of returns)
      for (const ri of r.material_return_items)
        returned.set(
          ri.material_issue_item_id,
          (returned.get(ri.material_issue_item_id) ?? 0) + Number(ri.quantity),
        );
    const hasReturns = returns.length > 0;
    const place = {
      blockId: d.block_id ?? "",
      floorId: d.floor_id ?? "",
      stageId: d.stage_id ?? "",
      crewId: d.crew_id,
    };
    for (const i of items)
      out.push({
        order: `${d.doc_date}|${startOf(d.id) || d.created_at}|${i.line_no}`,
        row: {
          key: i.id,
          id: d.id,
          kind: "issue",
          editable: items.length === 1 && !hasReturns,
          number: d.number,
          materialName: i.materials?.name ?? "",
          unitCode: i.materials?.units_of_measure?.code ?? "",
          hasReturns,
          issueItemId: i.id,
          returnable: Math.max(0, Number(i.quantity) - (returned.get(i.id) ?? 0)),
          issueNumber: null,
          draft: {
            docDate: d.doc_date,
            materialId: i.material_id,
            quantity: num(i.quantity),
            ...place,
          },
        },
      });
    for (const r of returns)
      for (const ri of r.material_return_items) {
        const i = itemById.get(ri.material_issue_item_id);
        if (!i) continue;
        out.push({
          order: `${r.doc_date}|${r.created_at}|${i.line_no}`,
          row: {
            key: ri.id,
            id: r.id,
            kind: "return",
            editable: false,
            number: r.number,
            materialName: i.materials?.name ?? "",
            unitCode: i.materials?.units_of_measure?.code ?? "",
            hasReturns: false,
            issueItemId: null,
            returnable: 0,
            issueNumber: d.number,
            draft: {
              docDate: r.doc_date,
              materialId: i.material_id,
              quantity: num(-Number(ri.quantity)),
              ...place,
            },
          },
        });
      }
  }
  return out.sort((a, b) => a.order.localeCompare(b.order)).map((x) => x.row);
}

export type ServiceDraft = {
  docDate: string;
  serviceId: string;
  serviceName: string;
  unitId: string;
  quantity: string;
  blockId: string;
  floorId: string;
  stageId: string;
  crewId: string;
};
export type ServiceUsageRow = SheetRow<ServiceDraft> & { unitCode: string };

export async function listServiceRows(projectId: string): Promise<ServiceUsageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_usages")
    .select(
      "id, doc_date, service_id, quantity, block_id, floor_id, stage_id, crew_id, services(name, unit_id, units_of_measure(code))",
    )
    .eq("project_id", projectId)
    .eq("status", "ACTIVE")
    .order("doc_date")
    .order("created_at")
    .limit(3000);
  if (error) throw new Error(error.message);
  return data.map((u) => ({
    key: u.id,
    id: u.id,
    editable: true,
    unitCode: u.services?.units_of_measure?.code ?? "",
    draft: {
      docDate: u.doc_date,
      serviceId: u.service_id,
      serviceName: u.services?.name ?? "",
      unitId: u.services?.unit_id ?? "",
      quantity: num(u.quantity),
      blockId: u.block_id ?? "",
      floorId: u.floor_id ?? "",
      stageId: u.stage_id ?? "",
      crewId: u.crew_id ?? "",
    },
  }));
}

/** Норматив и выдано (выдачи − возвраты) по материалу + блоку + этапу (Д-100). */
export type NormUsage = {
  materialId: string;
  blockId: string;
  stageId: string;
  norm: number | null;
  issued: number;
};

export async function listNormUsage(projectId: string): Promise<NormUsage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("norm_usage", { p_project: projectId });
  if (error) throw new Error(error.message);
  return (data ?? []).map((n) => ({
    materialId: n.material_id,
    blockId: n.block_id,
    stageId: n.stage_id,
    norm: n.norm === null ? null : Number(n.norm),
    issued: Number(n.issued ?? 0),
  }));
}

export const normKey = (materialId: string, blockId: string, stageId: string) =>
  `${materialId}:${blockId}:${stageId}`;

// ---------------------------------------------------------------------------------------
// Отчёт склада за период (их лист «Отчёт»): приход, расход по блокам и этапам, остаток
// ---------------------------------------------------------------------------------------
export type WarehouseReport = {
  incoming: { material: string; unit: string; quantity: number }[];
  outgoing: {
    material: string;
    unit: string;
    block: string;
    floor: string;
    stage: string;
    quantity: number;
    norm: number | null;
    normIssued: number | null;
  }[];
  balance: {
    material: string;
    unit: string;
    incoming: number;
    outgoing: number;
    balance: number;
  }[];
  /** Д-110: услуги за период — по услуге, блоку, этажу, этапу и бригаде. */
  services: {
    service: string;
    unit: string;
    block: string;
    floor: string;
    stage: string;
    crewId: string;
    crew: string;
    quantity: number;
    /** Сколько строк журнала в группе. */
    rows: number;
  }[];
};

export async function warehouseReport(
  projectId: string,
  from: string,
  to: string,
): Promise<WarehouseReport> {
  const supabase = await createClient();
  const [inc, outgoing, bal, services] = await Promise.all([
    supabase.rpc("report_warehouse_incoming", { p_project: projectId, p_from: from, p_to: to }),
    warehouseOutgoing(projectId, from, to),
    supabase.rpc("report_warehouse_balance", { p_project: projectId, p_to: to }),
    warehouseServices(projectId, from, to),
  ]);
  for (const r of [inc, bal]) if (r.error) throw new Error(r.error.message);
  return {
    incoming: (inc.data ?? []).map((r) => ({
      material: r.material,
      unit: r.unit,
      quantity: Number(r.quantity),
    })),
    outgoing,
    balance: (bal.data ?? []).map((r) => ({
      material: r.material,
      unit: r.unit,
      incoming: Number(r.incoming),
      outgoing: Number(r.outgoing),
      balance: Number(r.balance),
    })),
    services,
  };
}

/** Услуги за период (Д-110): действующие строки журнала, сгруппированные по месту и бригаде. */
export async function warehouseServices(
  projectId: string,
  from: string,
  to: string,
): Promise<WarehouseReport["services"]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_usages")
    .select(
      "quantity, crew_id, services(name, units_of_measure(code)), blocks(name), floors(name), work_stages(name), crews(name, leader_name)",
    )
    .eq("project_id", projectId)
    .eq("status", "ACTIVE")
    .gte("doc_date", from)
    .lte("doc_date", to)
    .limit(5000);
  if (error) throw new Error(error.message);
  const groups = new Map<string, WarehouseReport["services"][number]>();
  for (const u of data) {
    const leader = u.crews?.leader_name?.trim();
    const row = {
      service: u.services?.name ?? "",
      unit: u.services?.units_of_measure?.code ?? "",
      block: u.blocks?.name ?? "",
      floor: u.floors?.name ?? "",
      stage: u.work_stages?.name ?? "",
      crewId: u.crew_id ?? "",
      crew: u.crews
        ? leader && leader !== u.crews.name
          ? `${leader} (${u.crews.name})`
          : u.crews.name
        : "",
    };
    const key = [row.service, row.block, row.floor, row.stage, row.crewId].join("\u0000");
    const g = groups.get(key) ?? { ...row, quantity: 0, rows: 0 };
    g.quantity = Math.round((g.quantity + Number(u.quantity)) * 10000) / 10000;
    g.rows += 1;
    groups.set(key, g);
  }
  const by = (a: string, b: string) => a.localeCompare(b, "ru", { numeric: true });
  return [...groups.values()].sort(
    (a, b) =>
      by(a.service, b.service) ||
      by(a.block, b.block) ||
      by(a.floor, b.floor) ||
      by(a.stage, b.stage) ||
      by(a.crew, b.crew),
  );
}

/** Расход за период по блокам и этапам; crew (Д-107) — только выдачи этой бригады и возвраты по ним. */
export async function warehouseOutgoing(
  projectId: string,
  from: string,
  to: string,
  crew?: string,
): Promise<WarehouseReport["outgoing"]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_warehouse_outgoing", {
    p_project: projectId,
    p_from: from,
    p_to: to,
    ...(crew ? { p_crew: crew } : {}),
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    material: r.material,
    unit: r.unit,
    block: r.block ?? "",
    floor: r.floor ?? "",
    stage: r.stage ?? "",
    quantity: Number(r.quantity),
    norm: r.norm === null ? null : Number(r.norm),
    normIssued: r.norm_issued === null ? null : Number(r.norm_issued),
  }));
}

/** Статус норматива строки расхода: «В норме» / «Перерасход» / пусто (норматив не задан). */
export function normStatus(norm: number | null, issued: number | null): string {
  if (norm === null || issued === null) return "";
  return issued > norm ? "Перерасход" : "В норме";
}
