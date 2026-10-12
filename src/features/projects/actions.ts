"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import { emptyToNull } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { blockSchema, floorSchema, projectSchema, updateProjectSchema } from "./schemas";

/** Создание объекта. Автор становится участником объекта, склад создаётся автоматически (триггер, Д-22/Д-28). */
export async function createProject(input: unknown): Promise<ActionResult> {
  const auth = await authorize("projects.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: auth.org.id,
      code: v.code,
      name: v.name,
      address: emptyToNull(v.address),
      start_date: emptyToNull(v.startDate),
      end_date: emptyToNull(v.endDate),
    })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505"
      ? fail("Объект с таким кодом уже есть", { code: "Код занят" })
      : fail(dbErrorMessage(error));
  }

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(input: unknown): Promise<ActionResult> {
  const auth = await authorize("projects.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      code: v.code,
      name: v.name,
      address: emptyToNull(v.address),
      start_date: emptyToNull(v.startDate),
      end_date: emptyToNull(v.endDate),
      status: v.archived ? "ARCHIVED" : "ACTIVE",
    })
    .eq("id", v.id)
    .eq("organization_id", auth.org.id)
    .select("id");
  if (error) {
    return error.code === "23505"
      ? fail("Объект с таким кодом уже есть", { code: "Код занят" })
      : fail(dbErrorMessage(error));
  }
  // RLS молча отфильтровывает чужие строки: 0 обновлённых = нет доступа к объекту.
  if (data.length === 0) return fail("Недостаточно прав для этого объекта");

  revalidatePath("/projects");
  revalidatePath(`/projects/${v.id}`);
  return ok();
}

export async function addBlock(input: unknown): Promise<ActionResult> {
  const auth = await authorize("projects.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return fail("Укажите название блока");

  const supabase = await createClient();
  const { error } = await supabase.from("blocks").insert({
    organization_id: auth.org.id,
    project_id: parsed.data.projectId,
    name: parsed.data.name,
  });
  if (error) return fail(error.code === "23505" ? "Такой блок уже есть" : dbErrorMessage(error));

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return ok();
}

export async function addFloor(input: unknown): Promise<ActionResult> {
  const auth = await authorize("projects.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = floorSchema.safeParse(input);
  if (!parsed.success) return fail("Укажите название этажа");

  const supabase = await createClient();
  const { error } = await supabase.from("floors").insert({
    organization_id: auth.org.id,
    project_id: parsed.data.projectId,
    block_id: parsed.data.blockId,
    name: parsed.data.name,
  });
  if (error)
    return fail(error.code === "23505" ? "Такой этаж в блоке уже есть" : dbErrorMessage(error));

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return ok();
}

/** Удаление блока/этажа. Когда на них сошлются документы, FK не даст удалить — это ожидаемо. */
export async function deleteStructureItem(
  kind: "block" | "floor",
  id: string,
  projectId: string,
): Promise<ActionResult> {
  const auth = await authorize("projects.manage");
  if (!auth.ok) return fail(auth.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(kind === "block" ? "blocks" : "floors")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.org.id)
    .select("id");
  if (error) {
    return fail(
      error.code === "23503"
        ? "Нельзя удалить: на него ссылаются документы"
        : dbErrorMessage(error),
    );
  }
  if (data.length === 0) return fail("Недостаточно прав для этого объекта");

  revalidatePath(`/projects/${projectId}`);
  return ok();
}
