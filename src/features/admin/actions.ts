"use server";

import { revalidatePath } from "next/cache";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import { formatLogin, generateTemporaryPassword, loginToAuthEmail } from "@/lib/auth/login";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  createMemberSchema,
  resetMfaSchema,
  resetPasswordSchema,
  updateMemberSchema,
} from "./schemas";

export type IssuedPassword = { login: string; password: string };

const BF_MESSAGES_LOGIN_TAKEN = "Такой логин уже занят — выберите другой";

/**
 * Новый сотрудник (Д-87, Д-88): учётную запись Supabase Auth создаёт сервер (admin API) на
 * технической почте логина — писем нет; временный пароль возвращается администратору один раз
 * и нигде не сохраняется; при первом входе — обязательная смена (app_metadata). Членство и роли —
 * RPC add_member от имени администратора (права проверяются в БД). Любая ошибка — откат учётной записи.
 */
export async function createMember(input: unknown): Promise<ActionResult<IssuedPassword>> {
  const auth = await authorize("members.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = createMemberSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля формы");
  const v = parsed.data;

  const supabase = await createClient();
  const { data: login, error: checkError } = await supabase.rpc("prepare_member_account", {
    p_org: auth.org.id,
    p_login: v.login,
  });
  if (checkError || !login) return fail(dbErrorMessage(checkError));

  const admin = createAdminClient();
  const password = generateTemporaryPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: loginToAuthEmail(login),
    password,
    email_confirm: true, // письма не отправляются: техническая почта (.internal) не доставляется
    user_metadata: { full_name: v.fullName },
    app_metadata: { must_change_password: true },
  });
  if (createError || !created.user) {
    return fail(
      createError?.code === "email_exists"
        ? BF_MESSAGES_LOGIN_TAKEN
        : "Не удалось создать учётную запись",
    );
  }

  const userId = created.user.id;
  const rollback = async () => {
    await admin.auth.admin.deleteUser(userId);
  };
  const { error: loginError } = await admin.rpc("register_login", {
    p_user_id: userId,
    p_login: login,
  });
  if (loginError) {
    await rollback();
    return fail(dbErrorMessage(loginError));
  }
  const { error } = await supabase.rpc("add_member", {
    p_org: auth.org.id,
    p_user_id: userId,
    p_email: (v.email || null) as string,
    p_full_name: v.fullName,
    p_role_codes: v.roles,
    p_all_projects: v.allProjects,
    p_project_ids: v.allProjects ? [] : v.projectIds,
  });
  if (error) {
    await rollback();
    return fail(dbErrorMessage(error));
  }

  revalidatePath("/admin/members");
  return ok({ login: formatLogin(login), password });
}

/**
 * Сброс пароля администратором (Д-88): проверки в БД (aal2, не себе, своя организация) →
 * новый временный пароль и признак смены (admin API) → завершение всех сессий и аудит с причиной.
 */
export async function resetMemberPassword(input: unknown): Promise<ActionResult<IssuedPassword>> {
  const auth = await authorize("members.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Укажите причину сброса");
  const { memberId, reason } = parsed.data;

  const supabase = await createClient();
  const { data: userId, error: checkError } = await supabase.rpc("prepare_password_reset", {
    p_member_id: memberId,
  });
  if (checkError || !userId) return fail(dbErrorMessage(checkError));

  const password = generateTemporaryPassword();
  const { data: updated, error: updateError } = await createAdminClient().auth.admin.updateUserById(
    userId,
    {
      password,
      app_metadata: { must_change_password: true },
    },
  );
  if (updateError) return fail("Не удалось сменить пароль");

  const { error } = await supabase.rpc("complete_password_reset", {
    p_member_id: memberId,
    p_reason: reason,
  });
  if (error)
    return fail(`Пароль сменён, но сессии не завершены: ${dbErrorMessage(error)}. Повторите сброс`);

  const { data: logins } = await supabase.rpc("member_logins", { p_org: auth.org.id });
  const login = logins?.find((l) => l.member_id === memberId)?.login;
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/audit");
  return ok({ login: login ? formatLogin(login) : (updated.user?.email ?? ""), password });
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
