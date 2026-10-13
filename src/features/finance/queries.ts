import "server-only";

import { createClient } from "@/lib/supabase/server";

import type {
  CashCategory,
  CashStatus,
  PayableStatus,
  PaymentPurpose,
  PaymentRequestStatus,
} from "./labels";
import type { OperationsFilter } from "./schemas";

export type AccountRow = {
  id: string;
  name: string;
  kind: "CASH" | "BANK";
  currency: string;
  balance: number;
  bankName: string | null;
  accountNumber: string | null;
  projectId: string | null;
  isActive: boolean;
};

export async function listAccounts(orgId: string, activeOnly = false): Promise<AccountRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("cash_accounts")
    .select("id, name, kind, currency, balance, bank_name, account_number, project_id, is_active")
    .eq("organization_id", orgId)
    .order("is_active", { ascending: false })
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    currency: a.currency,
    balance: Number(a.balance),
    bankName: a.bank_name,
    accountNumber: a.account_number,
    projectId: a.project_id,
    isActive: a.is_active,
  }));
}

// ---------------------------------------------------------------------------------------
// Обязательства (US-05)
// ---------------------------------------------------------------------------------------
export type PayableRow = {
  id: string;
  supplierId: string | null;
  supplierName: string;
  projectLabel: string | null;
  source: string; // «Накладная НК-… (№ поставщика)» или основание введённого долга
  sourceHref: string | null;
  amount: number;
  paid: number;
  remaining: number;
  currency: string;
  status: PayableStatus;
  dueDate: string | null;
  createdAt: string;
};

/** Обязательства поставщикам (общая модель по источнику: накладная, ввод остатков; акты — фаза 4). */
export async function listPayables(
  orgId: string,
  f: { supplier?: string; project?: string; openOnly?: boolean },
): Promise<PayableRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("payables")
    .select(
      "id, supplier_id, amount, paid_amount, currency, status, due_date, created_at, source_doc_type, source_doc_id, basis, suppliers(name), projects(code, name)",
    )
    .eq("organization_id", orgId)
    .eq("counterparty_kind", "SUPPLIER")
    .order("created_at");
  if (f.supplier) q = q.eq("supplier_id", f.supplier);
  if (f.project) q = q.eq("project_id", f.project);
  if (f.openOnly) q = q.in("status", ["OPEN", "PARTIALLY_PAID"]);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const invoiceIds = data
    .filter((p) => p.source_doc_type === "SUPPLIER_INVOICE")
    .map((p) => p.source_doc_id);
  const invoices = new Map<string, { number: string | null; supplier_doc_number: string }>();
  if (invoiceIds.length > 0) {
    const { data: inv } = await supabase
      .from("supplier_invoices")
      .select("id, number, supplier_doc_number")
      .in("id", invoiceIds);
    for (const i of inv ?? []) invoices.set(i.id, i);
  }

  return data.map((p) => {
    const inv = invoices.get(p.source_doc_id);
    return {
      id: p.id,
      supplierId: p.supplier_id,
      supplierName: p.suppliers?.name ?? "",
      projectLabel: p.projects ? `${p.projects.code} — ${p.projects.name}` : null,
      source:
        p.source_doc_type === "SUPPLIER_INVOICE"
          ? `Накладная ${inv?.number ?? ""} (№ ${inv?.supplier_doc_number ?? "—"})`
          : `Ввод остатков: ${p.basis ?? ""}`,
      sourceHref:
        p.source_doc_type === "SUPPLIER_INVOICE"
          ? `/procurement/invoices/${p.source_doc_id}`
          : null,
      amount: Number(p.amount),
      paid: Number(p.paid_amount),
      remaining: Number(p.amount) - Number(p.paid_amount),
      currency: p.currency,
      status: p.status,
      dueDate: p.due_date,
      createdAt: p.created_at,
    };
  });
}

export type SupplierDebt = {
  supplierId: string;
  supplierName: string;
  currency: string;
  amount: number;
  paid: number;
  remaining: number;
  count: number;
};

/** Долги по поставщикам: итог по каждому (только неотменённые обязательства). */
export function groupBySupplier(rows: PayableRow[]): SupplierDebt[] {
  const map = new Map<string, SupplierDebt>();
  for (const r of rows) {
    if (r.status === "CANCELLED" || !r.supplierId) continue;
    const key = `${r.supplierId}:${r.currency}`;
    const g = map.get(key) ?? {
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      currency: r.currency,
      amount: 0,
      paid: 0,
      remaining: 0,
      count: 0,
    };
    g.amount += r.amount;
    g.paid += r.paid;
    g.remaining += r.remaining;
    g.count += 1;
    map.set(key, g);
  }
  // Деньги в JS — только для отображения сумм из БД; округляем до копеек, чтобы не копить погрешность.
  return [...map.values()]
    .map((g) => ({
      ...g,
      amount: round2(g.amount),
      paid: round2(g.paid),
      remaining: round2(g.remaining),
    }))
    .sort((a, b) => b.remaining - a.remaining);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export type PaymentRow = {
  id: string;
  payableId: string | null;
  number: string | null;
  docDate: string;
  amount: number;
  currency: string;
  transactionId: string;
};

export async function listPayments(payableIds: string[]): Promise<PaymentRow[]> {
  if (payableIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, payable_id, number, doc_date, amount, currency, cash_transaction_id")
    .in("payable_id", payableIds)
    .order("posted_at");
  if (error) throw new Error(error.message);
  return data.map((p) => ({
    id: p.id ?? "",
    payableId: p.payable_id,
    number: p.number,
    docDate: p.doc_date ?? "",
    amount: Number(p.amount),
    currency: p.currency ?? "",
    transactionId: p.cash_transaction_id ?? "",
  }));
}

// ---------------------------------------------------------------------------------------
// Операции (журнал)
// ---------------------------------------------------------------------------------------
export type OperationRow = {
  id: string;
  number: string | null;
  docDate: string;
  accountName: string;
  direction: "IN" | "OUT";
  kind: "REGULAR" | "REVERSAL" | "OPENING";
  category: CashCategory;
  amount: number;
  currency: string;
  counterparty: string;
  basis: string | null;
  status: CashStatus;
};

export async function listOperations(orgId: string, f: OperationsFilter): Promise<OperationRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("cash_transactions")
    .select(
      "id, number, doc_date, direction, kind, category, amount, currency, counterparty_name, basis, status, cash_accounts(name), suppliers(name), crews(name)",
    )
    .eq("organization_id", orgId)
    .order("doc_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (f.account) q = q.eq("cash_account_id", f.account);
  if (f.direction) q = q.eq("direction", f.direction);
  if (f.category) q = q.eq("category", f.category as CashCategory);
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("doc_date", f.from);
  if (f.to) q = q.lte("doc_date", f.to);
  if (f.q) q = q.ilike("number", `%${f.q}%`);
  if (f.reversal === "pending")
    q = q.eq("status", "POSTED").not("reversal_requested_by", "is", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map((t) => ({
    id: t.id,
    number: t.number,
    docDate: t.doc_date,
    accountName: t.cash_accounts?.name ?? "",
    direction: t.direction,
    kind: t.kind,
    category: t.category,
    amount: Number(t.amount),
    currency: t.currency,
    counterparty: t.suppliers?.name ?? t.crews?.name ?? t.counterparty_name ?? "",
    basis: t.basis,
    status: t.status,
  }));
}

export async function getOperation(id: string) {
  const supabase = await createClient();
  const { data: t, error } = await supabase
    .from("cash_transactions")
    .select(
      "id, organization_id, number, doc_date, direction, kind, category, amount, currency, counterparty_name, basis, note, status, cancel_reason, reversal_of_id, opening_balance_id, reversal_requested_by, reversal_requested_at, reversal_reason, cash_accounts(name), suppliers(name), crews(name), projects(code, name), cash_transaction_allocations(id, amount, payable_id, payment_request_id)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) return null;
  const { data: reversal } = await supabase
    .from("cash_transactions")
    .select("id, number")
    .eq("reversal_of_id", id)
    .maybeSingle();
  const { data: requester } = t.reversal_requested_by
    ? await supabase
        .from("organization_members")
        .select("full_name")
        .eq("organization_id", t.organization_id)
        .eq("user_id", t.reversal_requested_by)
        .maybeSingle()
    : { data: null };
  return {
    id: t.id,
    number: t.number,
    docDate: t.doc_date,
    direction: t.direction,
    kind: t.kind,
    category: t.category,
    amount: Number(t.amount),
    currency: t.currency,
    counterparty: t.suppliers?.name ?? t.crews?.name ?? t.counterparty_name ?? "",
    basis: t.basis,
    note: t.note,
    status: t.status,
    cancelReason: t.cancel_reason,
    reversalOfId: t.reversal_of_id,
    reversedBy: reversal ?? null,
    // Д-67: запрос на сторно ждёт решения бухгалтера.
    reversalRequest: t.reversal_requested_by
      ? {
          by: t.reversal_requested_by,
          byName: requester?.full_name ?? "",
          at: t.reversal_requested_at,
          reason: t.reversal_reason,
        }
      : null,
    openingBalanceId: t.opening_balance_id,
    accountName: t.cash_accounts?.name ?? "",
    projectLabel: t.projects ? `${t.projects.code} — ${t.projects.name}` : null,
    allocations: t.cash_transaction_allocations.map((a) => ({
      id: a.id,
      amount: Number(a.amount),
      payableId: a.payable_id,
      paymentRequestId: a.payment_request_id,
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Счета на оплату
// ---------------------------------------------------------------------------------------
export type PaymentRequestRow = {
  id: string;
  number: string | null;
  docDate: string;
  status: PaymentRequestStatus;
  purpose: PaymentPurpose;
  payee: string;
  amount: number;
  paid: number;
  remaining: number;
  currency: string;
  basis: string | null;
  createdBy: string | null;
};

export async function listPaymentRequests(
  orgId: string,
  statuses?: PaymentRequestStatus[],
): Promise<PaymentRequestRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("payment_requests")
    .select(
      "id, number, doc_date, status, purpose, payee_name, amount, paid_amount, currency, basis, created_by, crews(name)",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (statuses) q = q.in("status", statuses);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map((r) => ({
    id: r.id,
    number: r.number,
    docDate: r.doc_date,
    status: r.status,
    purpose: r.purpose,
    payee: r.crews?.name ?? r.payee_name ?? "",
    amount: Number(r.amount),
    paid: Number(r.paid_amount),
    remaining: Number(r.amount) - Number(r.paid_amount),
    currency: r.currency,
    basis: r.basis,
    createdBy: r.created_by,
  }));
}

export async function getPaymentRequest(id: string) {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("payment_requests")
    .select(
      "id, number, doc_date, status, purpose, payee_name, payee_crew_id, project_id, amount, paid_amount, currency, basis, note, status_comment, cancel_reason, created_by, crews(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) return null;
  const { data: payments } = await supabase
    .from("payments")
    .select("id, number, doc_date, amount, cash_transaction_id")
    .eq("payment_request_id", id)
    .order("posted_at");
  return {
    id: r.id,
    number: r.number,
    docDate: r.doc_date,
    status: r.status,
    purpose: r.purpose,
    payeeName: r.payee_name ?? "",
    payeeCrewId: r.payee_crew_id,
    projectId: r.project_id,
    amount: Number(r.amount),
    paid: Number(r.paid_amount),
    remaining: Number(r.amount) - Number(r.paid_amount),
    currency: r.currency,
    basis: r.basis ?? "",
    note: r.note ?? "",
    statusComment: r.status_comment,
    cancelReason: r.cancel_reason,
    createdBy: r.created_by,
    payments: (payments ?? []).map((p) => ({
      id: p.id ?? "",
      number: p.number,
      docDate: p.doc_date ?? "",
      amount: Number(p.amount),
      transactionId: p.cash_transaction_id ?? "",
    })),
  };
}

/** Поставщики с открытыми долгами — первый шаг «Оплатить долг» у кассира. */
export async function listSuppliersWithDebt(orgId: string) {
  return groupBySupplier(await listPayables(orgId, { openOnly: true }));
}

export type ReversalReportRow = {
  transactionId: string;
  number: string | null;
  docDate: string;
  accountName: string;
  direction: "IN" | "OUT";
  category: CashCategory;
  amount: number;
  currency: string;
  counterparty: string | null;
  reversalNumber: string | null;
  reversedAt: string | null;
  reason: string | null;
  initiatedBy: string | null;
  initiatedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
};

/** Отчёт «Сторно за период» (Д-67): бухгалтер и org_admin. */
export async function reversalsReport(
  orgId: string,
  from?: string,
  to?: string,
): Promise<ReversalReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_reversals_report", {
    p_org: orgId,
    p_from: (from ?? null) as string,
    p_to: (to ?? null) as string,
  });
  if (error) throw new Error(error.message);
  return data.map((r) => ({
    transactionId: r.transaction_id,
    number: r.number,
    docDate: r.doc_date,
    accountName: r.account_name,
    direction: r.direction,
    category: r.category,
    amount: Number(r.amount),
    currency: r.currency,
    counterparty: r.counterparty,
    reversalNumber: r.reversal_number,
    reversedAt: r.reversed_at,
    reason: r.reason,
    initiatedBy: r.initiated_by,
    initiatedAt: r.initiated_at,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
  }));
}
