"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/env";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { CURRENT_ORG_COOKIE, getAccess } from "@/lib/auth/access";
import { redirectAfterAuth } from "@/lib/auth/after-auth";
import { createClient } from "@/lib/supabase/server";

import { forgotPasswordSchema, loginSchema, setPasswordSchema } from "./schemas";

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте email и пароль");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Не раскрываем, что именно неверно: email или пароль.
  if (error) return fail("Неверный email или пароль");

  return redirectAfterAuth(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // Только эта сессия: «Выйти» на телефоне не должно выкидывать с компьютера.
  // Выход везде — побочный эффект сброса MFA (Д-45).
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(CURRENT_ORG_COOKIE);
  redirect("/login");
}

/**
 * «Забыли пароль»: письмо со ссылкой (шаблон supabase/templates/recovery.html).
 * Ответ всегда одинаковый — нельзя узнать, зарегистрирован ли email.
 */
export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Введите корректный email");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  });
  // Любую ошибку (включая 429) не показываем: Supabase ограничивает частоту только для
  // СУЩЕСТВУЮЩИХ адресов, и отдельное сообщение раскрыло бы, что учётная запись есть.
  if (error) console.warn("resetPasswordForEmail:", error.status, error.code);
  return ok();
}

/** Новый пароль: после приглашения (/set-password) или восстановления (/reset-password). */
export async function setPassword(input: unknown): Promise<ActionResult> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте пароль");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return fail(
      error.code === "same_password"
        ? "Новый пароль совпадает с текущим"
        : "Не удалось сохранить пароль",
    );
  }
  // Пароль не обходит второй фактор: роли с MFA дальше идут на /mfa.
  return redirectAfterAuth("/");
}

/** Переключение текущей организации (если пользователь состоит в нескольких). */
export async function switchOrganization(orgId: string): Promise<void> {
  const access = await getAccess();
  if (!access.organizations.some((o) => o.id === orgId)) return;
  (await cookies()).set(CURRENT_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}
