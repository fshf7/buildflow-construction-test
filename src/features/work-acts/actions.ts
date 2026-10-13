"use server";

import { revalidatePath } from "next/cache";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import type { Permission } from "@/lib/auth/permissions";
import { toNumber } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";

import { WORK_ACT_OPS, workActSchema, type WorkActOp } from "./schemas";

type Posted = { id: string; number: string | null; status: string };

function revalidateActs() {
  revalidatePath("/crews", "layout");
  revalidatePath("/finance", "layout");
  revalidatePath("/reports", "layout");
}

/** Черновик акта: тарифы подставляет БД на дату акта (Д-70). id от клиента — повтор не создаёт дубль. */
export async function saveWorkActDraft(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("work_acts.create");
  if (!auth.ok) return fail(auth.error);
  const parsed = workActSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_work_act_draft", {
    p_id: v.id,
    p_project_id: v.projectId,
    p_crew_id: v.crewId,
    p_doc_date: v.docDate,
    p_period_from: (v.periodFrom || null) as string,
    p_period_to: (v.periodTo || null) as string,
    p_note: v.note,
    p_lines: v.lines.map((l) => ({
      work_type: l.workType,
      block_id: l.blockId || null,
      floor_id: l.floorId || null,
      quantity: toNumber(l.quantity),
      note: l.note,
    })),
  });
  if (error) {
    if (error.message === "BF_NO_RATE")
      return fail(`Нет действующего тарифа: «${error.details}». Тариф устанавливает управляющий.`);
    return fail(dbErrorMessage(error));
  }
  revalidateActs();
  return ok({ id: v.id });
}

// Право проверяется и здесь, и в БД (там — ещё и объект, и «согласующий ≠ автор»).
const OP_PERMISSION: Record<WorkActOp, Permission> = {
  submit_work_act: "work_acts.create",
  approve_work_act: "work_acts.approve",
  reject_work_act: "work_acts.approve",
  cancel_work_act: "work_acts.view",
};

export async function runWorkActOp(
  op: WorkActOp,
  input: { id: string; key: string; comment: string },
): Promise<ActionResult<Posted>> {
  if (!WORK_ACT_OPS.includes(op)) return fail("Неизвестное действие");
  const auth = await authorize(OP_PERMISSION[op]);
  if (!auth.ok) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } =
    op === "submit_work_act" || op === "approve_work_act"
      ? await supabase.rpc(op, { p_id: input.id, p_key: input.key })
      : op === "reject_work_act"
        ? await supabase.rpc(op, { p_id: input.id, p_key: input.key, p_comment: input.comment })
        : await supabase.rpc(op, { p_id: input.id, p_key: input.key, p_reason: input.comment });
  if (error) return fail(dbErrorMessage(error));
  revalidateActs();
  return ok(data as Posted);
}

/** «Создать на основе» отклонённого или отменённого акта: новый черновик (id от клиента). */
export async function copyWorkAct(input: {
  sourceId: string;
  newId: string;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("work_acts.create");
  if (!auth.ok) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("copy_work_act", {
    p_source: input.sourceId,
    p_new_id: input.newId,
  });
  if (error) {
    if (error.message === "BF_NO_RATE")
      return fail(`Нет действующего тарифа: «${error.details}». Тариф устанавливает управляющий.`);
    return fail(dbErrorMessage(error));
  }
  revalidateActs();
  return ok({ id: input.newId });
}

export async function deleteWorkActDraft(id: string): Promise<ActionResult> {
  const auth = await authorize("work_acts.create");
  if (!auth.ok) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_work_act_draft", { p_id: id });
  if (error) return fail(dbErrorMessage(error));
  revalidateActs();
  return ok();
}
