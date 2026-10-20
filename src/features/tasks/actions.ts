"use server";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { getCurrentOrg } from "@/lib/auth/access";
import { hasAnyPermission } from "@/lib/auth/access-model";
import { authorize } from "@/lib/auth/guard";
import { revalidateApp } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";

import { taskCommentSchema, taskSchema, taskStatusSchema } from "./schemas";

type Saved = { id: string; number: string | null; status: string };

/** Создать или изменить задачу — управляющий по своему объекту (BP-06). */
export async function saveTask(input: unknown): Promise<ActionResult<Saved>> {
  const auth = await authorize("tasks.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_task", {
    p_id: v.id,
    p_project_id: v.projectId,
    p_title: v.title,
    p_description: v.description,
    p_assignee_member_id: v.assigneeMemberId,
    p_due_date: (v.dueDate || null) as string,
    p_priority: v.priority,
    p_block_id: (v.blockId || null) as string,
    p_floor_id: (v.floorId || null) as string,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Saved);
}

/** Переход статуса: кто и куда — проверяет БД (исполнитель / управляющий, §4.8). */
export async function changeTaskStatus(input: {
  id: string;
  key: string;
  status: string;
  comment: string;
}): Promise<ActionResult<Saved>> {
  const org = await getCurrentOrg();
  if (!org || !hasAnyPermission(org, ["tasks.execute", "tasks.manage"]))
    return fail("Недостаточно прав для этого действия");
  const status = taskStatusSchema.safeParse(input.status);
  if (!status.success) return fail("Неизвестный статус");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_task_status", {
    p_id: input.id,
    p_key: input.key,
    p_status: status.data,
    p_comment: input.comment,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok(data as Saved);
}

export async function addTaskComment(input: unknown): Promise<ActionResult> {
  const org = await getCurrentOrg();
  if (!org || !hasAnyPermission(org, ["tasks.view", "tasks.execute", "tasks.manage"]))
    return fail("Недостаточно прав для этого действия");
  const parsed = taskCommentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Напишите комментарий");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_task_comment", {
    p_task_id: parsed.data.taskId,
    p_id: parsed.data.id,
    p_body: parsed.data.body,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidateApp();
  return ok();
}
