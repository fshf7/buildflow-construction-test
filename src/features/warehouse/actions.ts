"use server";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import { toNumber } from "@/lib/decimal";
import { emptyToNull } from "@/lib/format";
import { revalidateApp } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";

import {
  crewSchema,
  issueRowFields,
  normFields,
  receiptRowFields,
  serviceRowFields,
  sheetSaveSchema,
  finishCorrectionSchema,
  quickIssueSchema,
  quickReceiveSchema,
  quickReturnSchema,
  startCorrectionSchema,
} from "./schemas";

type Posted = { id: string; number: string | null; status: string };

const positive = (q: string) => q !== "" && toNumber(q) > 0;

/**
 * «Принять» в одно действие (Д-55): черновик (id от клиента — повтор не создаёт дубль) и
 * проведение (ключ идемпотентности — повтор не меняет остаток).
 */
export async function quickReceive(input: unknown): Promise<ActionResult<Posted>> {
  const auth = await authorize("goods_receipts.post");
  if (!auth.ok) return fail(auth.error);
  const parsed = quickReceiveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте количества");
  const v = parsed.data;
  const lines = v.lines.filter((l) => positive(l.quantity));
  if (lines.length === 0) return fail("Укажите принятое количество хотя бы по одной строке");

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("save_goods_receipt_draft", {
    p_id: v.receiptId,
    p_project_id: v.projectId,
    p_supplier_id: (v.supplierId || null) as string,
    p_purchase_request_id: (v.requestId || null) as string,
    p_note: v.note,
    p_correction_reason: "",
    p_lines: lines.map((l) => ({
      purchase_request_item_id: l.purchaseRequestItemId || null,
      material_id: l.materialId || null,
      received_quantity: toNumber(l.quantity),
    })),
  });
  // Черновик уже проведён (повтор после успеха) — сохранять нечего, сразу к проведению с тем же ключом.
  if (saveError && saveError.message !== "BF_DOCUMENT_LOCKED")
    return fail(dbErrorMessage(saveError));

  const { data, error } = await supabase.rpc("post_goods_receipt", {
    p_id: v.receiptId,
    p_key: v.key,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

/** «Выдать» в одно действие: объект, блок, этаж, бригада обязательны (US-03); минус запрещён (Д-19). */
export async function quickIssue(input: unknown): Promise<ActionResult<Posted>> {
  const auth = await authorize("material_issues.post");
  if (!auth.ok) return fail(auth.error);
  const parsed = quickIssueSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const v = parsed.data;
  const lines = v.lines.filter((l) => positive(l.quantity));
  if (lines.length === 0) return fail("Укажите количество хотя бы по одному материалу");

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("save_material_issue_draft", {
    p_id: v.issueId,
    p_project_id: v.projectId,
    p_block_id: v.blockId,
    p_floor_id: v.floorId,
    p_crew_id: v.crewId,
    p_received_by_name: v.receivedByName,
    p_note: "",
    p_lines: lines.map((l) => ({ material_id: l.materialId, quantity: toNumber(l.quantity) })),
  });
  if (saveError && saveError.message !== "BF_DOCUMENT_LOCKED")
    return fail(dbErrorMessage(saveError));

  const { data, error } = await supabase.rpc("post_material_issue", {
    p_id: v.issueId,
    p_key: v.key,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

/** «Вернуть»: только по строкам выдачи и не больше выданного (US-04). */
export async function quickReturn(input: unknown): Promise<ActionResult<Posted>> {
  const auth = await authorize("material_issues.post");
  if (!auth.ok) return fail(auth.error);
  const parsed = quickReturnSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте количества");
  const v = parsed.data;
  const lines = v.lines.filter((l) => positive(l.quantity));
  if (lines.length === 0) return fail("Укажите количество хотя бы по одной строке");

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("save_material_return_draft", {
    p_id: v.returnId,
    p_material_issue_id: v.issueId,
    p_note: "",
    p_lines: lines.map((l) => ({
      material_issue_item_id: l.issueItemId,
      quantity: toNumber(l.quantity),
    })),
  });
  if (saveError && saveError.message !== "BF_DOCUMENT_LOCKED")
    return fail(dbErrorMessage(saveError));

  const { data, error } = await supabase.rpc("post_material_return", {
    p_id: v.returnId,
    p_key: v.key,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

/** Начать корректировку приёмки (Д-06) или сторно — корректировку до нуля строк (Д-52). */
export async function startReceiptCorrection(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("goods_receipts.post");
  if (!auth.ok) return fail(auth.error);
  const parsed = startCorrectionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Укажите причину");
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_receipt_correction", {
    p_original_id: v.originalId,
    p_new_id: v.newId,
    p_reason: v.reason,
    p_copy_lines: v.mode === "edit",
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok({ id: v.newId });
}

/**
 * Завершить корректировку: сохранить строки и провести (до начала сверки заявки) или отправить
 * бухгалтеру (после). Маршрут — по статусу заявки, окончательно его проверяет БД.
 */
export async function finishReceiptCorrection(input: unknown): Promise<ActionResult<Posted>> {
  const auth = await authorize("goods_receipts.post");
  if (!auth.ok) return fail(auth.error);
  const parsed = finishCorrectionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const v = parsed.data;

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("save_goods_receipt_draft", {
    p_id: v.id,
    p_project_id: v.projectId,
    p_supplier_id: null as unknown as string,
    p_purchase_request_id: null as unknown as string,
    p_note: "",
    p_correction_reason: v.reason,
    p_lines: v.lines
      .filter((l) => positive(l.quantity))
      .map((l) => ({
        purchase_request_item_id: l.purchaseRequestItemId || null,
        material_id: l.materialId,
        received_quantity: toNumber(l.quantity),
      })),
  });
  if (saveError && saveError.message !== "BF_DOCUMENT_LOCKED")
    return fail(dbErrorMessage(saveError));

  const { data: receipt } = await supabase
    .from("goods_receipts")
    .select("purchase_requests(status)")
    .eq("id", v.id)
    .maybeSingle();
  const needsApproval = ["ACCOUNTING_REVIEW", "DISCREPANCY", "CLOSED"].includes(
    receipt?.purchase_requests?.status ?? "",
  );
  const { data, error } = await supabase.rpc(
    needsApproval ? "submit_receipt_correction" : "post_goods_receipt",
    {
      p_id: v.id,
      p_key: v.key,
    },
  );
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

/** Сторно выдачи или возврата (§6.3): причина обязательна, остаток восстанавливается. */
export async function reverseDocument(
  kind: "issue" | "return",
  input: { id: string; key: string; comment: string },
): Promise<ActionResult<Posted>> {
  const auth = await authorize("material_issues.post");
  if (!auth.ok) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    kind === "issue" ? "reverse_material_issue" : "reverse_material_return",
    {
      p_id: input.id,
      p_key: input.key,
      p_reason: input.comment,
    },
  );
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Posted);
}

// ---------------------------------------------------------------------------------------
// Бригады — минимальный справочник (фаза 4 — полная модель)
// ---------------------------------------------------------------------------------------
export async function saveCrew(input: unknown): Promise<ActionResult> {
  const auth = await authorize("crews.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = crewSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const { id, ...v } = parsed.data;

  const supabase = await createClient();
  const row = {
    name: v.name,
    leader_name: emptyToNull(v.leaderName),
    phone: emptyToNull(v.phone),
    foreman_member_id: v.foremanMemberId || null,
    is_active: v.isActive,
  };
  const { error } = id
    ? await supabase.from("crews").update(row).eq("id", id).eq("organization_id", auth.org.id)
    : await supabase.from("crews").insert({ ...row, organization_id: auth.org.id });
  if (error)
    return fail(
      error.code === "23505" ? "Бригада с таким названием уже есть" : dbErrorMessage(error),
    );
  revalidateApp();
  return ok();
}

// ---------------------------------------------------------------------------------------
// Склад таблицами (Д-100): строка сохраняется сразу; исправление — корректировка/сторно в БД
// ---------------------------------------------------------------------------------------
type RowSaved = { id: string; number: string | null };

function rowError(error: { message?: string; code?: string; details?: string } | null) {
  return dbErrorMessage(error);
}

export async function saveReceiptRow(input: unknown): Promise<ActionResult<RowSaved>> {
  const auth = await authorize("goods_receipts.post");
  if (!auth.ok) return fail(auth.error);
  const meta = sheetSaveSchema.safeParse(input);
  const parsed = receiptRowFields.safeParse(input);
  if (!meta.success || !parsed.success)
    return fail(parsed.error?.issues[0]?.message ?? "Проверьте строку");
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_receipt_row", {
    p_id: meta.data.id,
    p_key: meta.data.key,
    p_project_id: meta.data.projectId,
    p_doc_date: v.docDate,
    p_material_id: (v.materialId || null) as string,
    p_material_name: v.materialName,
    p_unit_id: (v.unitId || null) as string,
    p_quantity: toNumber(v.quantity),
    p_supplier_id: (v.supplierId || null) as string,
  });
  if (error) return fail(rowError(error));
  revalidateApp();
  const r = data as { id: string; number: string | null };
  return ok({ id: r.id, number: r.number });
}

export async function saveIssueRow(input: unknown): Promise<ActionResult<RowSaved>> {
  const auth = await authorize("material_issues.post");
  if (!auth.ok) return fail(auth.error);
  const meta = sheetSaveSchema.safeParse(input);
  const parsed = issueRowFields.safeParse(input);
  if (!meta.success || !parsed.success)
    return fail(parsed.error?.issues[0]?.message ?? "Проверьте строку");
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_issue_row", {
    p_id: meta.data.id,
    p_key: meta.data.key,
    p_project_id: meta.data.projectId,
    p_doc_date: v.docDate,
    p_material_id: v.materialId,
    p_quantity: toNumber(v.quantity),
    p_block_id: (v.blockId || null) as string,
    p_floor_id: (v.floorId || null) as string,
    p_stage_id: (v.stageId || null) as string,
    p_crew_id: v.crewId,
  });
  if (error) return fail(rowError(error));
  revalidateApp();
  const r = data as { id: string; number: string | null };
  return ok({ id: r.id, number: r.number });
}

export async function saveServiceRow(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("material_issues.post");
  if (!auth.ok) return fail(auth.error);
  const meta = sheetSaveSchema.safeParse(input);
  const parsed = serviceRowFields.safeParse(input);
  if (!meta.success || !parsed.success)
    return fail(parsed.error?.issues[0]?.message ?? "Проверьте строку");
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_service_row", {
    p_id: meta.data.id,
    p_key: meta.data.key,
    p_project_id: meta.data.projectId,
    p_doc_date: v.docDate,
    p_service_id: (v.serviceId || null) as string,
    p_service_name: v.serviceName,
    p_unit_id: (v.unitId || null) as string,
    p_quantity: toNumber(v.quantity),
    p_block_id: (v.blockId || null) as string,
    p_floor_id: (v.floorId || null) as string,
    p_stage_id: (v.stageId || null) as string,
    p_crew_id: (v.crewId || null) as string,
  });
  if (error) return fail(rowError(error));
  revalidateApp();
  return ok({ id: meta.data.id });
}

export async function cancelServiceRow(id: string): Promise<ActionResult> {
  const auth = await authorize("material_issues.post");
  if (!auth.ok) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_service_row", { p_id: id });
  if (error) return fail(rowError(error));
  revalidateApp();
  return ok();
}

/** Норматив (Д-100): материал + блок + этап; задаёт управляющий (norms.manage, проверка в БД). */
export async function saveNorm(input: unknown): Promise<ActionResult> {
  const auth = await authorize("norms.manage");
  if (!auth.ok) return fail(auth.error);
  const project = sheetSaveSchema.pick({ projectId: true }).safeParse(input);
  const parsed = normFields.safeParse(input);
  if (!project.success || !parsed.success)
    return fail(parsed.error?.issues[0]?.message ?? "Проверьте строку");
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_material_norm", {
    p_project_id: project.data.projectId,
    p_material_id: v.materialId,
    p_block_id: v.blockId,
    p_stage_id: v.stageId,
    p_quantity: toNumber(v.quantity),
    p_note: v.note,
  });
  if (error) return fail(rowError(error));
  revalidateApp();
  return ok();
}
