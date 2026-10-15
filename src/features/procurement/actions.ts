"use server";

import { revalidatePath } from "next/cache";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import { toNumber } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";

import {
  INVOICE_OPERATIONS,
  invoiceDraftSchema,
  REQUEST_OPERATIONS,
  requestDraftSchema,
  requestOperationPermission,
  transitionSchema,
  type InvoiceOperation,
  type RequestOperation,
} from "./schemas";

type Result = { id: string; number: string | null; status: string };

// ---------------------------------------------------------------------------------------
// Заявки
// ---------------------------------------------------------------------------------------
/** Черновик заявки: шапка и строки — одной транзакцией в БД (Д-58). id генерирует клиент. */
export async function saveRequestDraft(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("purchase_requests.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = requestDraftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля формы");
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_purchase_request_draft", {
    p_id: v.id,
    p_project_id: v.projectId,
    p_needed_by: (v.neededBy || null) as string,
    p_currency: v.currency,
    p_note: v.note,
    p_lines: v.lines.map((l) => ({
      material_id: l.materialId,
      quantity: toNumber(l.quantity),
      note: l.note,
    })),
  });
  if (error) return fail(dbErrorMessage(error));

  revalidatePath("/procurement/requests");
  revalidatePath(`/procurement/requests/${v.id}`);
  return ok({ id: v.id });
}

/** Переход статуса заявки (§4.1). Ключ идемпотентности — от формы. */
export async function runRequestOperation(
  operation: RequestOperation,
  input: unknown,
): Promise<ActionResult<Result>> {
  if (!REQUEST_OPERATIONS.includes(operation)) return fail("Неизвестная операция");
  const auth = await authorize(requestOperationPermission(operation));
  if (!auth.ok) return fail(auth.error);
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return fail("Неверный запрос");
  const { id, key, comment } = parsed.data;

  const supabase = await createClient();
  const call =
    operation === "cancel_purchase_request"
      ? supabase.rpc(operation, { p_id: id, p_key: key, p_reason: comment })
      : operation === "mark_purchase_discrepancy" || operation === "resolve_purchase_discrepancy"
        ? supabase.rpc(operation, { p_id: id, p_key: key, p_comment: comment })
        : supabase.rpc(operation, { p_id: id, p_key: key });
  const { data, error } = await call;
  if (error) return fail(dbErrorMessage(error));

  revalidatePath("/procurement/requests");
  revalidatePath(`/procurement/requests/${id}`);
  return ok(data as Result);
}

// ---------------------------------------------------------------------------------------
// Накладные
// ---------------------------------------------------------------------------------------
export async function saveInvoiceDraft(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("supplier_invoices.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = invoiceDraftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля формы");
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_supplier_invoice_draft", {
    p_id: v.id,
    p_project_id: v.projectId,
    p_supplier_id: v.supplierId,
    p_purchase_request_id: (v.purchaseRequestId || null) as string,
    p_supplier_doc_number: v.supplierDocNumber,
    p_supplier_doc_date: v.supplierDocDate,
    p_currency: v.currency,
    p_note: v.note,
    p_lines: v.lines.map((l) => ({
      material_id: l.materialId || null,
      description: l.description,
      unit_id: l.unitId || null,
      quantity: toNumber(l.quantity),
      price: toNumber(l.price),
      purchase_request_item_id: l.purchaseRequestItemId || null,
    })),
  });
  if (error) {
    return fail(
      error.code === "23505"
        ? "Накладная с таким номером и датой у этого поставщика уже введена"
        : dbErrorMessage(error),
    );
  }

  revalidatePath("/procurement/invoices");
  revalidatePath(`/procurement/invoices/${v.id}`);
  return ok({ id: v.id });
}

export async function runInvoiceOperation(
  operation: InvoiceOperation,
  input: unknown,
): Promise<ActionResult<Result>> {
  if (!INVOICE_OPERATIONS.includes(operation)) return fail("Неизвестная операция");
  const auth = await authorize("supplier_invoices.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return fail("Неверный запрос");
  const { id, key, comment } = parsed.data;

  const supabase = await createClient();
  const { data, error } =
    operation === "cancel_supplier_invoice"
      ? await supabase.rpc(operation, { p_id: id, p_key: key, p_reason: comment })
      : await supabase.rpc(operation, { p_id: id, p_key: key });
  if (error) return fail(dbErrorMessage(error));

  revalidatePath("/procurement/invoices");
  revalidatePath(`/procurement/invoices/${id}`);
  return ok(data as Result);
}

// ---------------------------------------------------------------------------------------
// Согласование корректировок приёмки (Д-06)
// ---------------------------------------------------------------------------------------
export async function decideReceiptCorrection(
  decision: "approve" | "return",
  input: unknown,
): Promise<ActionResult<Result>> {
  const auth = await authorize("goods_receipts.approve_correction");
  if (!auth.ok) return fail(auth.error);
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return fail("Неверный запрос");
  const { id, key, comment } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    decision === "approve" ? "approve_receipt_correction" : "return_receipt_correction",
    { p_id: id, p_key: key, p_comment: comment },
  );
  if (error) return fail(dbErrorMessage(error));

  revalidatePath("/procurement/approvals");
  revalidatePath(`/warehouse/receipts/${id}`);
  return ok(data as Result);
}

/** Удаление черновика (номера у черновиков нет — нумерация без дыр, Д-10). */
export async function deleteDraft(
  docType:
    | "PURCHASE_REQUEST"
    | "SUPPLIER_INVOICE"
    | "GOODS_RECEIPT"
    | "MATERIAL_ISSUE"
    | "MATERIAL_RETURN",
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_document_draft", { p_doc_type: docType, p_id: id });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/procurement");
  revalidatePath("/warehouse");
  return ok();
}
