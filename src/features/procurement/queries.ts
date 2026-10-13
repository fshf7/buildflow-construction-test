import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { InvoiceStatus, RequestStatus } from "./labels";
import type { ListFilters } from "./schemas";

// ---------------------------------------------------------------------------------------
// Заявки
// ---------------------------------------------------------------------------------------
export type RequestListRow = {
  id: string;
  number: string | null;
  docDate: string;
  status: RequestStatus;
  hasDiscrepancy: boolean;
  projectLabel: string;
  suppliers: string[];
  linesCount: number;
  total: number | null; // null — нет права prices.view
  currency: string;
};

/** Список заявок с фильтрами (серверная фильтрация, параметры из URL). */
export async function listRequests(
  orgId: string,
  f: ListFilters,
  withPrices: boolean,
): Promise<RequestListRow[]> {
  const supabase = await createClient();
  // Фильтр по поставщику — через строки (inner join).
  const items = f.supplier
    ? "purchase_request_items!inner(id, supplier_id, suppliers(name))"
    : "purchase_request_items(id, supplier_id, suppliers(name))";
  let query = supabase
    .from("purchase_requests")
    .select(
      `id, number, doc_date, status, has_discrepancy, currency, projects(code, name), ${items}`,
    )
    .eq("organization_id", orgId)
    .order("doc_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (f.status) query = query.eq("status", f.status as RequestStatus);
  if (f.project) query = query.eq("project_id", f.project);
  if (f.supplier) query = query.eq("purchase_request_items.supplier_id", f.supplier);
  if (f.from) query = query.gte("doc_date", f.from);
  if (f.to) query = query.lte("doc_date", f.to);
  if (f.q) query = query.ilike("number", `%${f.q}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const totals = withPrices
    ? await requestTotals(data.map((r) => r.id))
    : new Map<string, number>();
  return data.map((r) => {
    const lines = r.purchase_request_items as { id: string; suppliers: { name: string } | null }[];
    return {
      id: r.id,
      number: r.number,
      docDate: r.doc_date,
      status: r.status,
      hasDiscrepancy: r.has_discrepancy,
      projectLabel: r.projects ? `${r.projects.code} — ${r.projects.name}` : "—",
      suppliers: [
        ...new Set(lines.map((l) => l.suppliers?.name).filter((n): n is string => Boolean(n))),
      ],
      linesCount: lines.length,
      total: withPrices ? (totals.get(r.id) ?? 0) : null,
      currency: r.currency,
    };
  });
}

/** Суммы заявок — только через витрину цен (§5.4). */
async function requestTotals(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_request_items_priced")
    .select("purchase_request_id, amount")
    .in("purchase_request_id", ids);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const row of data) {
    if (!row.purchase_request_id) continue;
    map.set(
      row.purchase_request_id,
      (map.get(row.purchase_request_id) ?? 0) + Number(row.amount ?? 0),
    );
  }
  return map;
}

export type RequestLine = {
  id: string;
  lineNo: number;
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  supplierId: string | null;
  supplierName: string | null;
  note: string | null;
  price: number | null; // null — цена не задана или нет prices.view
  amount: number | null;
  received: number;
  remaining: number;
  diff: number;
};

export type RequestDetail = {
  id: string;
  number: string | null;
  docDate: string;
  status: RequestStatus;
  hasDiscrepancy: boolean;
  statusComment: string | null;
  cancelReason: string | null;
  projectId: string;
  projectLabel: string;
  neededBy: string | null;
  currency: string;
  note: string | null;
  lines: RequestLine[];
  total: number | null;
  invoices: {
    id: string;
    number: string | null;
    supplierName: string;
    supplierDocNumber: string;
    status: InvoiceStatus;
  }[];
  receipts: {
    id: string;
    number: string | null;
    supplierName: string;
    status: string;
    docDate: string;
  }[];
};

export async function getRequest(
  orgId: string,
  id: string,
  withPrices: boolean,
): Promise<RequestDetail | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("purchase_requests")
    .select(
      "id, number, doc_date, status, has_discrepancy, status_comment, cancel_reason, project_id, needed_by, currency, note, projects(code, name)",
    )
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) return null;

  const [items, fulfillment, priced, invoices, receipts] = await Promise.all([
    supabase
      .from("purchase_request_items")
      .select(
        "id, line_no, material_id, quantity, supplier_id, note, materials(name, units_of_measure(code)), suppliers(name)",
      )
      .eq("purchase_request_id", id)
      .order("line_no"),
    supabase
      .from("purchase_request_fulfillment")
      .select("purchase_request_item_id, received, remaining, diff")
      .eq("purchase_request_id", id),
    withPrices
      ? supabase
          .from("purchase_request_items_priced")
          .select("id, price, amount")
          .eq("purchase_request_id", id)
      : Promise.resolve({
          data: [] as { id: string | null; price: number | null; amount: number | null }[],
          error: null,
        }),
    supabase
      .from("supplier_invoices")
      .select("id, number, status, supplier_doc_number, suppliers(name)")
      .eq("purchase_request_id", id)
      .order("created_at"),
    supabase
      .from("goods_receipts")
      .select("id, number, status, doc_date, suppliers(name)")
      .eq("purchase_request_id", id)
      .order("created_at"),
  ]);
  for (const res of [items, fulfillment, priced, invoices, receipts])
    if (res.error) throw new Error(res.error.message);

  const ful = new Map((fulfillment.data ?? []).map((f) => [f.purchase_request_item_id, f]));
  const prices = new Map((priced.data ?? []).map((p) => [p.id, p]));
  const lines: RequestLine[] = (items.data ?? []).map((i) => {
    const f = ful.get(i.id);
    const p = prices.get(i.id);
    return {
      id: i.id,
      lineNo: i.line_no,
      materialId: i.material_id,
      materialName: i.materials?.name ?? "",
      unit: i.materials?.units_of_measure?.code ?? "",
      quantity: Number(i.quantity),
      supplierId: i.supplier_id,
      supplierName: i.suppliers?.name ?? null,
      note: i.note,
      price: p?.price ?? null,
      amount: p?.amount ?? null,
      received: Number(f?.received ?? 0),
      remaining: Number(f?.remaining ?? i.quantity),
      diff: Number(f?.diff ?? -i.quantity),
    };
  });

  return {
    id: r.id,
    number: r.number,
    docDate: r.doc_date,
    status: r.status,
    hasDiscrepancy: r.has_discrepancy,
    statusComment: r.status_comment,
    cancelReason: r.cancel_reason,
    projectId: r.project_id,
    projectLabel: r.projects ? `${r.projects.code} — ${r.projects.name}` : "—",
    neededBy: r.needed_by,
    currency: r.currency,
    note: r.note,
    lines,
    total: withPrices ? lines.reduce((s, l) => s + Number(l.amount ?? 0), 0) : null,
    invoices: (invoices.data ?? []).map((v) => ({
      id: v.id,
      number: v.number,
      supplierName: v.suppliers?.name ?? "",
      supplierDocNumber: v.supplier_doc_number,
      status: v.status,
    })),
    receipts: (receipts.data ?? []).map((g) => ({
      id: g.id,
      number: g.number,
      supplierName: g.suppliers?.name ?? "",
      status: g.status,
      docDate: g.doc_date,
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Накладные
// ---------------------------------------------------------------------------------------
export type InvoiceListRow = {
  id: string;
  number: string | null;
  docDate: string;
  status: InvoiceStatus;
  supplierName: string;
  supplierDocNumber: string;
  supplierDocDate: string;
  projectLabel: string;
  requestNumber: string | null;
  total: number | null;
  currency: string;
};

export async function listInvoices(
  orgId: string,
  f: ListFilters,
  withPrices: boolean,
): Promise<InvoiceListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("supplier_invoices")
    .select(
      "id, number, doc_date, status, supplier_doc_number, supplier_doc_date, currency, suppliers(name), projects(code, name), purchase_requests(number)",
    )
    .eq("organization_id", orgId)
    .order("doc_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (f.status) query = query.eq("status", f.status as InvoiceStatus);
  if (f.project) query = query.eq("project_id", f.project);
  if (f.supplier) query = query.eq("supplier_id", f.supplier);
  if (f.from) query = query.gte("doc_date", f.from);
  if (f.to) query = query.lte("doc_date", f.to);
  if (f.q) query = query.or(`number.ilike.%${f.q}%,supplier_doc_number.ilike.%${f.q}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let totals = new Map<string, number>();
  if (withPrices && data.length > 0) {
    const { data: priced, error: pError } = await supabase
      .from("supplier_invoices_priced")
      .select("id, total_amount")
      .in(
        "id",
        data.map((v) => v.id),
      );
    if (pError) throw new Error(pError.message);
    totals = new Map(priced.map((p) => [p.id ?? "", Number(p.total_amount ?? 0)]));
  }

  return data.map((v) => ({
    id: v.id,
    number: v.number,
    docDate: v.doc_date,
    status: v.status,
    supplierName: v.suppliers?.name ?? "",
    supplierDocNumber: v.supplier_doc_number,
    supplierDocDate: v.supplier_doc_date,
    projectLabel: v.projects ? `${v.projects.code} — ${v.projects.name}` : "—",
    requestNumber: v.purchase_requests?.number ?? null,
    total: withPrices ? (totals.get(v.id) ?? 0) : null,
    currency: v.currency,
  }));
}

export type InvoiceLine = {
  id: string;
  materialId: string | null;
  materialName: string | null;
  description: string | null;
  unitId: string;
  unit: string;
  quantity: number;
  price: number | null;
  amount: number | null;
  purchaseRequestItemId: string | null;
  received: number | null; // принято по строке заявки — для сверки
};

export type InvoiceDetail = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  projectId: string;
  projectLabel: string;
  supplierId: string;
  supplierName: string;
  purchaseRequestId: string | null;
  requestNumber: string | null;
  supplierDocNumber: string;
  supplierDocDate: string;
  currency: string;
  note: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  total: number | null;
  payable: { amount: number; paid: number; status: string } | null;
  lines: InvoiceLine[];
  attachments: { id: string; fileName: string; url: string | null }[];
};

export async function getInvoice(
  orgId: string,
  id: string,
  withPrices: boolean,
): Promise<InvoiceDetail | null> {
  const supabase = await createClient();
  const { data: v, error } = await supabase
    .from("supplier_invoices")
    .select(
      "id, number, status, project_id, supplier_id, purchase_request_id, supplier_doc_number, supplier_doc_date, currency, note, cancel_reason, confirmed_at, suppliers(name), projects(code, name), purchase_requests(number)",
    )
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) return null;

  const [items, priced, total, payable, fulfillment, attachments] = await Promise.all([
    supabase
      .from("supplier_invoice_items")
      .select(
        "id, line_no, material_id, description, unit_id, quantity, purchase_request_item_id, materials(name), units_of_measure(code)",
      )
      .eq("supplier_invoice_id", id)
      .order("line_no"),
    withPrices
      ? supabase
          .from("supplier_invoice_items_priced")
          .select("id, price, amount")
          .eq("supplier_invoice_id", id)
      : Promise.resolve({
          data: [] as { id: string | null; price: number | null; amount: number | null }[],
          error: null,
        }),
    withPrices
      ? supabase.from("supplier_invoices_priced").select("total_amount").eq("id", id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("payables")
      .select("amount, paid_amount, status")
      .eq("source_doc_type", "SUPPLIER_INVOICE")
      .eq("source_doc_id", id)
      .maybeSingle(),
    v.purchase_request_id
      ? supabase
          .from("purchase_request_fulfillment")
          .select("purchase_request_item_id, received")
          .eq("purchase_request_id", v.purchase_request_id)
      : Promise.resolve({
          data: [] as { purchase_request_item_id: string | null; received: number | null }[],
          error: null,
        }),
    supabase
      .from("document_attachments")
      .select("id, file_name, storage_path")
      .eq("doc_type", "SUPPLIER_INVOICE")
      .eq("doc_id", id)
      .order("created_at"),
  ]);
  for (const res of [items, priced, total, payable, fulfillment, attachments]) {
    if (res.error) throw new Error(res.error.message);
  }

  const prices = new Map((priced.data ?? []).map((p) => [p.id, p]));
  const received = new Map(
    (fulfillment.data ?? []).map((f) => [f.purchase_request_item_id, Number(f.received ?? 0)]),
  );
  const files = await Promise.all(
    (attachments.data ?? []).map(async (a) => {
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(a.storage_path, 300);
      return { id: a.id, fileName: a.file_name, url: data?.signedUrl ?? null };
    }),
  );

  return {
    id: v.id,
    number: v.number,
    status: v.status,
    projectId: v.project_id,
    projectLabel: v.projects ? `${v.projects.code} — ${v.projects.name}` : "—",
    supplierId: v.supplier_id,
    supplierName: v.suppliers?.name ?? "",
    purchaseRequestId: v.purchase_request_id,
    requestNumber: v.purchase_requests?.number ?? null,
    supplierDocNumber: v.supplier_doc_number,
    supplierDocDate: v.supplier_doc_date,
    currency: v.currency,
    note: v.note,
    cancelReason: v.cancel_reason,
    confirmedAt: v.confirmed_at,
    total: withPrices ? Number(total.data?.total_amount ?? 0) : null,
    payable: payable.data
      ? {
          amount: Number(payable.data.amount),
          paid: Number(payable.data.paid_amount),
          status: payable.data.status,
        }
      : null,
    lines: (items.data ?? []).map((i) => ({
      id: i.id,
      materialId: i.material_id,
      materialName: i.materials?.name ?? null,
      description: i.description,
      unitId: i.unit_id,
      unit: i.units_of_measure?.code ?? "",
      quantity: Number(i.quantity),
      price: prices.get(i.id)?.price ?? null,
      amount: prices.get(i.id)?.amount ?? null,
      purchaseRequestItemId: i.purchase_request_item_id,
      received: i.purchase_request_item_id ? (received.get(i.purchase_request_item_id) ?? 0) : null,
    })),
    attachments: files,
  };
}

/** Строки заявки поставщика с ценами — заготовка накладной. */
export async function requestLinesForInvoice(requestId: string, supplierId: string) {
  const supabase = await createClient();
  const [{ data: items, error }, { data: priced, error: pError }, { data: ful, error: fError }] =
    await Promise.all([
      supabase
        .from("purchase_request_items")
        .select("id, material_id, quantity, materials(name, unit_id)")
        .eq("purchase_request_id", requestId)
        .eq("supplier_id", supplierId)
        .order("line_no"),
      supabase
        .from("purchase_request_items_priced")
        .select("id, price")
        .eq("purchase_request_id", requestId),
      supabase
        .from("purchase_request_fulfillment")
        .select("purchase_request_item_id, received")
        .eq("purchase_request_id", requestId),
    ]);
  if (error || pError || fError) throw new Error((error ?? pError ?? fError)!.message);
  const prices = new Map(priced.map((p) => [p.id, p.price]));
  const received = new Map(ful.map((f) => [f.purchase_request_item_id, Number(f.received ?? 0)]));
  return items.map((i) => ({
    purchaseRequestItemId: i.id,
    materialId: i.material_id,
    unitId: i.materials?.unit_id ?? "",
    // В накладную по умолчанию — принятое количество (если уже принимали), иначе заказанное.
    quantity: received.get(i.id) || Number(i.quantity),
    price: prices.get(i.id) ?? 0,
  }));
}

/** Корректировки приёмок, ожидающие решения бухгалтера. */
export async function listPendingCorrections(orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goods_receipts")
    .select(
      "id, correction_reason, created_at, corrects_receipt_id, suppliers(name), projects(code), purchase_requests(number)",
    )
    .eq("organization_id", orgId)
    .eq("status", "CORRECTION_APPROVAL")
    .order("created_at");
  if (error) throw new Error(error.message);
  return data.map((g) => ({
    id: g.id,
    reason: g.correction_reason,
    createdAt: g.created_at,
    originalId: g.corrects_receipt_id,
    supplierName: g.suppliers?.name ?? "",
    projectCode: g.projects?.code ?? "",
    requestNumber: g.purchase_requests?.number ?? null,
  }));
}

/** Заявки, по которым можно вводить накладные (в работе и далее). */
export async function listRequestOptions(
  orgId: string,
): Promise<{ id: string; projectId: string; label: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id, project_id, number, doc_date")
    .eq("organization_id", orgId)
    .not("status", "in", "(DRAFT,CANCELLED)")
    .order("doc_date", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return data.map((r) => ({ id: r.id, projectId: r.project_id, label: r.number ?? "—" }));
}
