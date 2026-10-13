import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { OpeningKind } from "./schemas";

export type OpeningRow = {
  id: string;
  number: string | null;
  kind: OpeningKind;
  docDate: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
  projectLabel: string | null;
  cancelReason: string | null;
};

export async function listOpenings(orgId: string): Promise<OpeningRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opening_balances")
    .select("id, number, kind, doc_date, status, cancel_reason, projects(code, name)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data.map((o) => ({
    id: o.id,
    number: o.number,
    kind: o.kind,
    docDate: o.doc_date,
    status: o.status,
    projectLabel: o.projects ? `${o.projects.code} — ${o.projects.name}` : null,
    cancelReason: o.cancel_reason,
  }));
}

export async function getOpening(id: string) {
  const supabase = await createClient();
  const { data: o, error } = await supabase
    .from("opening_balances")
    .select(
      "id, number, kind, doc_date, status, note, cancel_reason, project_id, projects(code, name), opening_stock_items(line_no, material_id, quantity, materials(name, units_of_measure(code))), opening_cash_items(line_no, cash_account_id, amount, cash_accounts(name, currency)), opening_payable_items(line_no, supplier_id, project_id, amount, currency, basis, due_date, suppliers(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) return null;
  const byLine = <T extends { line_no: number }>(a: T[]) =>
    [...a].sort((x, y) => x.line_no - y.line_no);
  return {
    id: o.id,
    number: o.number,
    kind: o.kind,
    docDate: o.doc_date,
    status: o.status,
    note: o.note ?? "",
    cancelReason: o.cancel_reason,
    projectId: o.project_id,
    projectLabel: o.projects ? `${o.projects.code} — ${o.projects.name}` : null,
    stock: byLine(o.opening_stock_items).map((l) => ({
      materialId: l.material_id,
      name: l.materials?.name ?? "",
      unit: l.materials?.units_of_measure?.code ?? "",
      quantity: Number(l.quantity),
    })),
    cash: byLine(o.opening_cash_items).map((l) => ({
      accountId: l.cash_account_id,
      name: l.cash_accounts?.name ?? "",
      currency: l.cash_accounts?.currency ?? "TJS",
      amount: Number(l.amount),
    })),
    payables: byLine(o.opening_payable_items).map((l) => ({
      supplierId: l.supplier_id,
      supplierName: l.suppliers?.name ?? "",
      projectId: l.project_id,
      amount: Number(l.amount),
      currency: l.currency,
      basis: l.basis,
      dueDate: l.due_date,
    })),
  };
}
