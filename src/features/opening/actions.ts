"use server";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import { toNumber } from "@/lib/decimal";
import { revalidateApp } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";

import { openingSchema } from "./schemas";

type Posted = { id: string; number: string | null; status: string };

/** Черновик «Ввода остатков» (Д-61): строки по виду; цены у складских строк отсутствуют. */
export async function saveOpening(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("opening_balances.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = openingSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте строки");
  const v = parsed.data;
  const lines =
    v.kind === "STOCK"
      ? v.lines.map((l) => ({ material_id: l.materialId, quantity: toNumber(l.quantity) }))
      : v.kind === "CASH"
        ? v.lines.map((l) => ({ cash_account_id: l.accountId, amount: toNumber(l.amount) }))
        : v.lines.map((l) => ({
            supplier_id: l.supplierId,
            project_id: l.projectId || null,
            amount: toNumber(l.amount),
            currency: l.currency,
            basis: l.basis,
            due_date: l.dueDate || null,
          }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_opening_balance_draft", {
    p_id: v.id,
    p_org: auth.org.id,
    p_kind: v.kind,
    p_project_id: (v.projectId || null) as string,
    p_doc_date: v.docDate,
    p_note: v.note,
    p_lines: lines,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok({ id: v.id });
}

export async function postOpening(input: {
  id: string;
  key: string;
}): Promise<ActionResult<Posted>> {
  const auth = await authorize("opening_balances.manage");
  if (!auth.ok) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_opening_balance", {
    p_id: input.id,
    p_key: input.key,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

export async function reverseOpening(input: {
  id: string;
  key: string;
  comment: string;
}): Promise<ActionResult<Posted>> {
  const auth = await authorize("opening_balances.manage");
  if (!auth.ok) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_opening_balance", {
    p_id: input.id,
    p_key: input.key,
    p_reason: input.comment,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

export async function deleteOpening(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_opening_balance_draft", { p_id: id });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok();
}
