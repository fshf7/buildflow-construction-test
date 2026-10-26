import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { IssueStatus, ReceiptStatus } from "./labels";

// Цен здесь нет и быть не может: складские таблицы их не содержат (§5.4).

export type Balance = { materialId: string; name: string; unit: string; quantity: number };

export async function listBalances(projectId: string): Promise<Balance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_balances")
    .select("material_id, quantity, materials(name, units_of_measure(code))")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data
    .map((b) => ({
      materialId: b.material_id,
      name: b.materials?.name ?? "",
      unit: b.materials?.units_of_measure?.code ?? "",
      quantity: Number(b.quantity),
    }))
    .sort(
      (a, b) =>
        Number(b.quantity > 0) - Number(a.quantity > 0) || a.name.localeCompare(b.name, "ru"),
    );
}

export type ReceiptTarget = {
  requestId: string;
  requestNumber: string;
  lines: { name: string; unit: string; remaining: number }[];
};

/** Что ждём: заявки в работе и строки с остатком к приёмке. Поставщика склад не указывает (Д-102). */
export async function listReceiptTargets(projectId: string): Promise<ReceiptTarget[]> {
  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("purchase_requests")
    .select("id, number")
    .eq("project_id", projectId)
    .in("status", ["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED"])
    .order("doc_date");
  if (error) throw new Error(error.message);
  if (requests.length === 0) return [];

  const { data: lines, error: lError } = await supabase
    .from("purchase_request_fulfillment")
    .select("purchase_request_id, remaining, material_id, line_no")
    .in(
      "purchase_request_id",
      requests.map((r) => r.id),
    )
    .order("line_no");
  if (lError) throw new Error(lError.message);
  const materialIds = [
    ...new Set(lines.map((l) => l.material_id).filter((m): m is string => Boolean(m))),
  ];
  const { data: materials, error: mError } = await supabase
    .from("materials")
    .select("id, name, units_of_measure(code)")
    .in("id", materialIds);
  if (mError) throw new Error(mError.message);

  const mat = new Map(materials.map((m) => [m.id, m]));
  const targets = requests.map((r): ReceiptTarget => ({
    requestId: r.id,
    requestNumber: r.number ?? "",
    lines: lines
      .filter((l) => l.purchase_request_id === r.id && Number(l.remaining) > 0)
      .map((l) => {
        const m = mat.get(l.material_id!);
        return {
          name: m?.name ?? "",
          unit: m?.units_of_measure?.code ?? "",
          remaining: Number(l.remaining),
        };
      }),
  }));
  // Сначала то, что ещё ждём; полностью принятые — в конце (довоз сверх заказа возможен).
  return targets.sort((a, b) => Number(b.lines.length > 0) - Number(a.lines.length > 0));
}

export type ReceiveLine = {
  purchaseRequestItemId: string;
  materialId: string;
  name: string;
  unit: string;
  ordered: number;
  received: number;
  remaining: number;
};

export async function receiveFormData(requestId: string) {
  const supabase = await createClient();
  const [{ data: req, error }, { data: lines, error: lError }] = await Promise.all([
    supabase
      .from("purchase_requests")
      .select("id, number, project_id, status")
      .eq("id", requestId)
      .maybeSingle(),
    supabase
      .from("purchase_request_fulfillment")
      .select("purchase_request_item_id, material_id, ordered, received, remaining, line_no")
      .eq("purchase_request_id", requestId)
      .order("line_no"),
  ]);
  if (error || lError) throw new Error((error ?? lError)!.message);
  if (!req) return null;
  const { data: materials } = await supabase
    .from("materials")
    .select("id, name, units_of_measure(code)")
    .in("id", lines.map((l) => l.material_id!).filter(Boolean));
  const mat = new Map((materials ?? []).map((m) => [m.id, m]));
  return {
    requestId: req.id,
    requestNumber: req.number ?? "",
    projectId: req.project_id,
    status: req.status,
    lines: lines.map((l): ReceiveLine => ({
      purchaseRequestItemId: l.purchase_request_item_id!,
      materialId: l.material_id!,
      name: mat.get(l.material_id!)?.name ?? "",
      unit: mat.get(l.material_id!)?.units_of_measure?.code ?? "",
      ordered: Number(l.ordered),
      received: Number(l.received),
      remaining: Number(l.remaining),
    })),
  };
}

export type IssueCard = {
  id: string;
  number: string | null;
  docDate: string;
  crewName: string;
  place: string;
  lines: { name: string; unit: string; quantity: number }[];
};

/** Проведённые выдачи за 30 дней — из них оформляют возврат (US-04). */
export async function listRecentIssues(projectId: string): Promise<IssueCard[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("material_issues")
    .select(
      "id, number, doc_date, crews(name), blocks(name), floors(name), material_issue_items(quantity, materials(name, units_of_measure(code)))",
    )
    .eq("project_id", projectId)
    .eq("status", "POSTED")
    .gte("doc_date", since)
    .order("posted_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data.map((i) => ({
    id: i.id,
    number: i.number,
    docDate: i.doc_date,
    crewName: i.crews?.name ?? "",
    place: [i.blocks?.name, i.floors?.name ? `этаж ${i.floors.name}` : null]
      .filter(Boolean)
      .join(", "),
    lines: i.material_issue_items.map((l) => ({
      name: l.materials?.name ?? "",
      unit: l.materials?.units_of_measure?.code ?? "",
      quantity: Number(l.quantity),
    })),
  }));
}

export type ReturnLine = {
  issueItemId: string;
  name: string;
  unit: string;
  issued: number;
  returned: number;
  max: number;
};

export async function returnFormData(issueId: string) {
  const supabase = await createClient();
  const { data: issue, error } = await supabase
    .from("material_issues")
    .select(
      "id, number, status, project_id, crews(name), material_issue_items(id, quantity, materials(name, units_of_measure(code)))",
    )
    .eq("id", issueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!issue) return null;
  const { data: returned, error: rError } = await supabase
    .from("material_return_items")
    .select("material_issue_item_id, quantity, material_returns!inner(status)")
    .in(
      "material_issue_item_id",
      issue.material_issue_items.map((l) => l.id),
    )
    .eq("material_returns.status", "POSTED");
  if (rError) throw new Error(rError.message);
  const sum = new Map<string, number>();
  for (const r of returned)
    sum.set(
      r.material_issue_item_id,
      (sum.get(r.material_issue_item_id) ?? 0) + Number(r.quantity),
    );

  return {
    id: issue.id,
    number: issue.number,
    status: issue.status as IssueStatus,
    projectId: issue.project_id,
    crewName: issue.crews?.name ?? "",
    lines: issue.material_issue_items.map((l): ReturnLine => ({
      issueItemId: l.id,
      name: l.materials?.name ?? "",
      unit: l.materials?.units_of_measure?.code ?? "",
      issued: Number(l.quantity),
      returned: sum.get(l.id) ?? 0,
      max: Number(l.quantity) - (sum.get(l.id) ?? 0),
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Карточки документов
// ---------------------------------------------------------------------------------------
export type ReceiptDetail = {
  id: string;
  number: string | null;
  status: ReceiptStatus;
  docDate: string;
  projectId: string;
  projectLabel: string;
  supplierId: string | null;
  supplierName: string;
  requestId: string | null;
  requestNumber: string | null;
  requestStatus: string | null;
  correctsReceiptId: string | null;
  correctedBy: string | null;
  correctionReason: string | null;
  needsApproval: boolean;
  lines: {
    id: string;
    purchaseRequestItemId: string | null;
    materialId: string;
    name: string;
    unit: string;
    ordered: number | null;
    received: number;
  }[];
  originalLines: { materialId: string; name: string; unit: string; received: number }[];
  approvals: { action: string; comment: string | null; at: string }[];
  attachments: { id: string; fileName: string; url: string | null }[];
};

export async function getReceipt(id: string): Promise<ReceiptDetail | null> {
  const supabase = await createClient();
  const { data: g, error } = await supabase
    .from("goods_receipts")
    .select(
      "id, number, status, doc_date, project_id, supplier_id, purchase_request_id, corrects_receipt_id, correction_reason, projects(code, name), suppliers(name), purchase_requests(number, status), goods_receipt_items(id, line_no, material_id, purchase_request_item_id, ordered_quantity, received_quantity, materials(name, units_of_measure(code)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!g) return null;

  const [original, correctedBy, approvals, attachments] = await Promise.all([
    g.corrects_receipt_id
      ? supabase
          .from("goods_receipt_items")
          .select("material_id, received_quantity, materials(name, units_of_measure(code))")
          .eq("goods_receipt_id", g.corrects_receipt_id)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("goods_receipts").select("id").eq("corrects_receipt_id", id).maybeSingle(),
    supabase
      .from("approval_requests")
      .select("approval_actions(action, comment, created_at)")
      .eq("doc_type", "GOODS_RECEIPT")
      .eq("doc_id", id),
    supabase
      .from("document_attachments")
      .select("id, file_name, storage_path")
      .eq("doc_type", "GOODS_RECEIPT")
      .eq("doc_id", id)
      .order("created_at"),
  ]);
  const files = await Promise.all(
    (attachments.data ?? []).map(async (a) => {
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(a.storage_path, 300);
      return { id: a.id, fileName: a.file_name, url: data?.signedUrl ?? null };
    }),
  );
  const requestStatus = g.purchase_requests?.status ?? null;

  return {
    id: g.id,
    number: g.number,
    status: g.status,
    docDate: g.doc_date,
    projectId: g.project_id,
    projectLabel: g.projects ? `${g.projects.code} — ${g.projects.name}` : "",
    supplierId: g.supplier_id,
    supplierName: g.suppliers?.name ?? "",
    requestId: g.purchase_request_id,
    requestNumber: g.purchase_requests?.number ?? null,
    requestStatus,
    correctsReceiptId: g.corrects_receipt_id,
    correctedBy: correctedBy.data?.id ?? null,
    correctionReason: g.correction_reason,
    // Д-06: после начала сверки заявки корректировку согласует бухгалтер.
    needsApproval: ["ACCOUNTING_REVIEW", "DISCREPANCY", "CLOSED"].includes(requestStatus ?? ""),
    lines: [...g.goods_receipt_items]
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => ({
        id: l.id,
        purchaseRequestItemId: l.purchase_request_item_id,
        materialId: l.material_id,
        name: l.materials?.name ?? "",
        unit: l.materials?.units_of_measure?.code ?? "",
        ordered: l.ordered_quantity === null ? null : Number(l.ordered_quantity),
        received: Number(l.received_quantity),
      })),
    originalLines: (original.data ?? []).map((l) => ({
      materialId: l.material_id,
      name: l.materials?.name ?? "",
      unit: l.materials?.units_of_measure?.code ?? "",
      received: Number(l.received_quantity),
    })),
    approvals: (approvals.data ?? [])
      .flatMap((a) => a.approval_actions)
      .map((a) => ({ action: a.action, comment: a.comment, at: a.created_at }))
      .sort((a, b) => a.at.localeCompare(b.at)),
    attachments: files,
  };
}

export type IssueDetail = {
  id: string;
  number: string | null;
  status: IssueStatus;
  docDate: string;
  projectId: string;
  projectLabel: string;
  crewName: string;
  blockName: string;
  floorName: string;
  stageName: string;
  receivedByName: string | null;
  cancelReason: string | null;
  lines: { name: string; unit: string; quantity: number }[];
  returns: { id: string; number: string | null; status: IssueStatus }[];
};

export async function getIssue(id: string): Promise<IssueDetail | null> {
  const supabase = await createClient();
  const { data: i, error } = await supabase
    .from("material_issues")
    .select(
      "id, number, status, doc_date, project_id, received_by_name, cancel_reason, projects(code, name), crews(name), blocks(name), floors(name), work_stages(name), material_issue_items(line_no, quantity, materials(name, units_of_measure(code))), material_returns(id, number, status)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!i) return null;
  return {
    id: i.id,
    number: i.number,
    status: i.status,
    docDate: i.doc_date,
    projectId: i.project_id,
    projectLabel: i.projects ? `${i.projects.code} — ${i.projects.name}` : "",
    crewName: i.crews?.name ?? "",
    blockName: i.blocks?.name ?? "",
    floorName: i.floors?.name ?? "",
    stageName: i.work_stages?.name ?? "",
    receivedByName: i.received_by_name,
    cancelReason: i.cancel_reason,
    lines: [...i.material_issue_items]
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => ({
        name: l.materials?.name ?? "",
        unit: l.materials?.units_of_measure?.code ?? "",
        quantity: Number(l.quantity),
      })),
    returns: i.material_returns.map((r) => ({ id: r.id, number: r.number, status: r.status })),
  };
}

export type ReturnDetail = {
  id: string;
  number: string | null;
  status: IssueStatus;
  docDate: string;
  projectId: string;
  issueId: string;
  issueNumber: string | null;
  crewName: string;
  cancelReason: string | null;
  lines: { name: string; unit: string; quantity: number }[];
};

export async function getReturn(id: string): Promise<ReturnDetail | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("material_returns")
    .select(
      "id, number, status, doc_date, project_id, material_issue_id, cancel_reason, crews(name), material_issues(number), material_return_items(line_no, quantity, materials(name, units_of_measure(code)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) return null;
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    docDate: r.doc_date,
    projectId: r.project_id,
    issueId: r.material_issue_id,
    issueNumber: r.material_issues?.number ?? null,
    crewName: r.crews?.name ?? "",
    cancelReason: r.cancel_reason,
    lines: [...r.material_return_items]
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => ({
        name: l.materials?.name ?? "",
        unit: l.materials?.units_of_measure?.code ?? "",
        quantity: Number(l.quantity),
      })),
  };
}

// ---------------------------------------------------------------------------------------
// Журнал и история
// ---------------------------------------------------------------------------------------
export async function listMaterialMovements(projectId: string, materialId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, quantity, movement_type, occurred_on, created_at, source_doc_type, source_doc_id")
    .eq("project_id", projectId)
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data;
}
