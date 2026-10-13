"use server";

import { revalidatePath } from "next/cache";

import { env } from "@/env";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { inviteMemberSchema, resetMfaSchema, updateMemberSchema } from "./schemas";

/**
 * Приглашение участника. Самостоятельной регистрации нет: Auth-пользователя создаёт сервер
 * (секретный ключ — только здесь и только после проверки members.manage), а членство и роли
 * добавляет RPC add_member от имени администратора — права проверяются ещё раз в БД.
 */
export async function inviteMember(input: unknown): Promise<ActionResult<{ emailSent: boolean }>> {
  const auth = await authorize("members.manage");
  if (!auth.ok) return fail(auth.error);

  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const v = parsed.data;

  const admin = createAdminClient();
  const { data: existingId, error: findError } = await admin.rpc("find_user_id_by_email", {
    p_email: v.email,
  });
  if (findError) return fail("Не удалось проверить email");

  let userId = existingId;
  let emailSent = false;
  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(v.email, {
      data: { full_name: v.fullName },
      redirectTo: env.NEXT_PUBLIC_SITE_URL,
    });
    if (error || !data.user) {
      return fail(
        error?.status === 429
          ? "Слишком много писем за короткое время. Попробуйте через минуту"
          : "Не удалось отправить приглашение",
      );
    }
    userId = data.user.id;
    emailSent = true;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_member", {
    p_org: auth.org.id,
    p_user_id: userId,
    p_email: v.email,
    p_full_name: v.fullName,
    p_role_codes: v.roles,
    p_all_projects: v.allProjects,
    p_project_ids: v.allProjects ? [] : v.projectIds,
  });
  if (error) return fail(dbErrorMessage(error));

  revalidatePath("/admin/members");
  return ok({ emailSent });
}

export async function updateMember(input: unknown): Promise<ActionResult> {
  const auth = await authorize("members.manage");
  if (!auth.ok) return fail(auth.error);

  const parsed = updateMemberSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member", {
    p_member_id: v.memberId,
    p_full_name: v.fullName,
    p_phone: v.phone,
    p_is_active: v.isActive,
    p_role_codes: v.roles,
    p_all_projects: v.allProjects,
    p_project_ids: v.allProjects ? [] : v.projectIds,
  });
  if (error) return fail(dbErrorMessage(error));

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${v.memberId}`);
  return ok();
}

/**
 * Сброс второго фактора участнику (Д-45): удаляет факторы и завершает все его сессии.
 * Проверки — в БД (reset_member_mfa): администратор с aal2, не себе, причина обязательна, аудит.
 */
export async function resetMemberMfa(input: unknown): Promise<ActionResult> {
  const auth = await authorize("members.manage");
  if (!auth.ok) return fail(auth.error);

  const parsed = resetMfaSchema.safeParse(input);
  if (!parsed.success) return fail("Укажите причину сброса");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_member_mfa", {
    p_member_id: parsed.data.memberId,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(dbErrorMessage(error));

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return ok();
}
