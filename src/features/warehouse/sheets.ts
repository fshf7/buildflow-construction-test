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
  supplierId: string;
};
export type IncomingRow = SheetRow<IncomingDraft> & {
  number: string | null;
  unitCode: string;
  supplierName: string;
  requestNumber: string | null;
};

export async function listIncomingRows(projectId: string): Promise<IncomingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goods_receipts")
    .select(
      "id, number, doc_date, supplier_id, suppliers(name), purchase_requests(number), goods_receipt_items(id, line_no, material_id, received_quantity, materials(name, unit_id, units_of_measure(code)))",
    )
    .eq("project_id", projectId)
    .eq("status", "POSTED")
    .order("doc_date")
    .order("created_at")
    .limit(3000);
  if (error) throw new Error(error.message);
  return data.flatMap((g) => {
    const items = [...g.goods_receipt_items].sort((a, b) => a.line_no - b.line_no);
    return items.map((i) => ({
      key: i.id,
      id: g.id,
      editable: items.length === 1,
      number: g.number,
      unitCode: i.materials?.units_of_measure?.code ?? "",
      supplierName: g.suppliers?.name ?? "",
      requestNumber: g.purchase_requests?.number ?? null,
      draft: {
        docDate: g.doc_date,
        materialId: i.material_id,
        materialName: i.materials?.name ?? "",
        unitId: i.materials?.unit_id ?? "",
        quantity: num(i.received_quantity),
        supplierId: g.supplier_id ?? "",
      },
    }));
  });
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
  number: string | null;
  materialName: string;
  unitCode: string;
  /** Возвраты по выдаче — для подсказки, почему строку нельзя править. */
  hasReturns: boolean;
};

export async function listOutgoingRows(projectId: string): Promise<OutgoingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_issues")
    .select(
      "id, number, doc_date, block_id, floor_id, stage_id, crew_id, material_issue_items(id, line_no, material_id, quantity, materials(name, units_of_measure(code))), material_returns(status)",
    )
    .eq("project_id", projectId)
    .eq("status", "POSTED")
    .order("doc_date")
    .order("created_at")
    .limit(3000);
  if (error) throw new Error(error.message);
  return data.flatMap((d) => {
    const items = [...d.material_issue_items].sort((a, b) => a.line_no - b.line_no);
    const hasReturns = d.material_returns.some((r) => r.status === "POSTED");
    return items.map((i) => ({
      key: i.id,
      id: d.id,
      editable: items.length === 1 && !hasReturns,
      number: d.number,
      materialName: i.materials?.name ?? "",
      unitCode: i.materials?.units_of_measure?.code ?? "",
      hasReturns,
      draft: {
        docDate: d.doc_date,
        materialId: i.material_id,
        quantity: num(i.quantity),
        blockId: d.block_id ?? "",
        floorId: d.floor_id ?? "",
        stageId: d.stage_id ?? "",
        crewId: d.crew_id,
      },
    }));
  });
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
  incoming: { material: string; unit: string; quantity: number; suppliers: string }[];
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
};

export async function warehouseReport(
  projectId: string,
  from: string,
  to: string,
): Promise<WarehouseReport> {
  const supabase = await createClient();
  const [inc, out, bal] = await Promise.all([
    supabase.rpc("report_warehouse_incoming", { p_project: projectId, p_from: from, p_to: to }),
    supabase.rpc("report_warehouse_outgoing", { p_project: projectId, p_from: from, p_to: to }),
    supabase.rpc("report_warehouse_balance", { p_project: projectId, p_to: to }),
  ]);
  for (const r of [inc, out, bal]) if (r.error) throw new Error(r.error.message);
  return {
    incoming: (inc.data ?? []).map((r) => ({
      material: r.material,
      unit: r.unit,
      quantity: Number(r.quantity),
      suppliers: r.suppliers ?? "",
    })),
    outgoing: (out.data ?? []).map((r) => ({
      material: r.material,
      unit: r.unit,
      block: r.block ?? "",
      floor: r.floor ?? "",
      stage: r.stage ?? "",
      quantity: Number(r.quantity),
      norm: r.norm === null ? null : Number(r.norm),
      normIssued: r.norm_issued === null ? null : Number(r.norm_issued),
    })),
    balance: (bal.data ?? []).map((r) => ({
      material: r.material,
      unit: r.unit,
      incoming: Number(r.incoming),
      outgoing: Number(r.outgoing),
      balance: Number(r.balance),
    })),
  };
}

/** Статус норматива строки расхода: «В норме» / «Перерасход» / пусто (норматив не задан). */
export function normStatus(norm: number | null, issued: number | null): string {
  if (norm === null || issued === null) return "";
  return issued > norm ? "Перерасход" : "В норме";
}
