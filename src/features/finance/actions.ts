"use server";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import { toNumber } from "@/lib/decimal";
import { revalidateApp } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";

import { cashAccountSchema, paymentRequestSchema, quickCashSchema } from "./schemas";

type Posted = { id: string; number: string | null; status: string; reversal_number?: string };

export async function saveCashAccount(input: unknown): Promise<ActionResult> {
  const auth = await authorize("cash_accounts.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = cashAccountSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_cash_account", {
    p_id: v.id,
    p_org: auth.org.id,
    p_name: v.name,
    p_kind: v.kind,
    p_currency: v.currency,
    p_bank_name: v.bankName,
    p_account_number: v.accountNumber,
    p_project_id: (v.projectId || null) as string,
    p_is_active: v.isActive,
  });
  if (error)
    return fail(
      error.code === "23505" ? "Касса с таким названием уже есть" : dbErrorMessage(error),
    );
  revalidateApp();
  return ok();
}

/**
 * Приход, расход по счёту или оплата долга — одним действием (Д-55): черновик (id от клиента) и
 * проведение (ключ идемпотентности). Повтор не списывает деньги дважды.
 */
export async function quickCash(input: unknown): Promise<ActionResult<Posted>> {
  const auth = await authorize("cash.post");
  if (!auth.ok) return fail(auth.error);
  const parsed = quickCashSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const v = parsed.data;
  const allocations = v.allocations
    .filter((a) => a.amount !== "" && toNumber(a.amount) > 0)
    .map((a) => ({
      payable_id: a.payableId || null,
      payment_request_id: a.paymentRequestId || null,
      amount: toNumber(a.amount),
    }));

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("save_cash_transaction_draft", {
    p_id: v.id,
    p_org: auth.org.id,
    p_cash_account_id: v.accountId,
    p_direction: v.direction,
    p_category: v.category,
    p_amount: toNumber(v.amount),
    p_project_id: (v.projectId || null) as string,
    p_counterparty_supplier_id: (v.supplierId || null) as string,
    p_counterparty_crew_id: (v.crewId || null) as string,
    p_counterparty_name: v.counterpartyName,
    p_basis: v.basis,
    p_note: "",
    p_allocations: allocations,
  });
  if (saveError && saveError.message !== "BF_DOCUMENT_LOCKED")
    return fail(dbErrorMessage(saveError));

  const { data, error } = await supabase.rpc("post_cash_transaction", { p_id: v.id, p_key: v.key });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

/** Д-67: сторно кассир только запрашивает (причина обязательна). */
export async function requestReversal(input: {
  id: string;
  key: string;
  comment: string;
}): Promise<ActionResult<Posted>> {
  const auth = await authorize("cash.reverse");
  if (!auth.ok) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_cash_reversal", {
    p_id: input.id,
    p_key: input.key,
    p_reason: input.comment,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

/** Д-67: бухгалтер согласует (сторно проводится) или отклоняет; согласующий ≠ инициатор (БД). */
export async function decideReversal(
  decision: "approve" | "reject",
  input: { id: string; key: string; comment: string },
): Promise<ActionResult<Posted>> {
  const auth = await authorize("cash.reverse_approve");
  if (!auth.ok) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    decision === "approve" ? "approve_cash_reversal" : "reject_cash_reversal",
    {
      p_id: input.id,
      p_key: input.key,
      p_comment: input.comment,
    },
  );
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

// ---------------------------------------------------------------------------------------
// Счета на оплату (§4.5)
// ---------------------------------------------------------------------------------------
export async function savePaymentRequest(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("payment_requests.create");
  if (!auth.ok) return fail(auth.error);
  const parsed = paymentRequestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_payment_request_draft", {
    p_id: v.id,
    p_org: auth.org.id,
    p_project_id: (v.projectId || null) as string,
    p_purpose: v.purpose,
    p_payee_crew_id: (v.payeeCrewId || null) as string,
    p_payee_name: v.payeeName,
    p_amount: toNumber(v.amount),
    p_currency: v.currency,
    p_basis: v.basis,
    p_note: v.note,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok({ id: v.id });
}

const REQUEST_OPS = [
  "submit_payment_request",
  "approve_payment_request",
  "return_payment_request",
  "cancel_payment_request",
] as const;

export async function runPaymentRequestOp(
  op: (typeof REQUEST_OPS)[number],
  input: { id: string; key: string; comment: string },
): Promise<ActionResult<Posted>> {
  if (!REQUEST_OPS.includes(op)) return fail("Неизвестная операция");
  const supabase = await createClient();
  const { data, error } =
    op === "return_payment_request"
      ? await supabase.rpc(op, { p_id: input.id, p_key: input.key, p_comment: input.comment })
      : op === "cancel_payment_request"
        ? await supabase.rpc(op, { p_id: input.id, p_key: input.key, p_reason: input.comment })
        : await supabase.rpc(op, { p_id: input.id, p_key: input.key });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

export async function deleteFinanceDraft(
  kind: "CASH_TRANSACTION" | "PAYMENT_REQUEST",
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_finance_draft", { p_kind: kind, p_id: id });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok();
}
