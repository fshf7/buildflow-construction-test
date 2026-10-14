"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fail, type ActionResult } from "@/lib/actions/result";
import { CURRENT_ORG_COOKIE, getAccess } from "@/lib/auth/access";
import { redirectAfterAuth } from "@/lib/auth/after-auth";
import { isEmailLogin, loginToAuthEmail, normalizeLogin } from "@/lib/auth/login";
import { clientIp, rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { loginSchema, setPasswordSchema } from "./schemas";

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте логин и пароль");
  const login = parsed.data.login;

  // Д-80: перебор паролей — лимит на IP и на логин (поверх лимитов Supabase Auth).
  const limit = await rateLimit([
    { name: "login_ip", value: await clientIp() },
    { name: "login_id", value: isEmailLogin(login) ? login.toLowerCase() : normalizeLogin(login) },
  ]);
  if (!limit.ok) return fail(tooManyMessage(limit.retryAfterSec));

  const supabase = await createClient();
  // Д-87: логин → техническая почта учётной записи; писем она не получает.
  const { error } = await supabase.auth.signInWithPassword({
    email: loginToAuthEmail(login),
    password: parsed.data.password,
  });
  // Не раскрываем, что именно неверно: логин или пароль.
  if (error) return fail("Неверный логин или пароль");

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
 * Новый пароль — обязательно после временного (Д-89). Затем сервер снимает признак смены
 * (admin API, user_id — из проверенного токена) и обновляет сессию, чтобы новый токен был без него.
 */
export async function setPassword(input: unknown): Promise<ActionResult> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте пароль");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return fail(
      error.code === "same_password"
        ? "Новый пароль должен отличаться от временного"
        : "Не удалось сохранить пароль",
    );
  }
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (userId && data?.claims?.app_metadata?.must_change_password) {
    const { error: flagError } = await createAdminClient().auth.admin.updateUserById(userId, {
      app_metadata: { must_change_password: false },
    });
    if (flagError) return fail("Пароль сохранён, но не удалось завершить смену — войдите заново");
    await supabase.auth.refreshSession();
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
