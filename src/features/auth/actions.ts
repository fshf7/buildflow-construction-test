"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fail, type ActionResult } from "@/lib/actions/result";
import { CURRENT_ORG_COOKIE, getAccess } from "@/lib/auth/access";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

import { loginSchema, setPasswordSchema } from "./schemas";

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте email и пароль");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Не раскрываем, что именно неверно: email или пароль.
  if (error) return fail("Неверный email или пароль");

  // Д-29: redirect из server action отдаёт страницу в том же ответе, минуя proxy.ts, —
  // поэтому привилегированных пользователей отправляем на второй фактор прямо отсюда.
  const target = safeNextPath(next);
  const { data: requiresMfa } = await supabase.rpc("current_user_requires_mfa");
  if (requiresMfa) {
    redirect(target === "/" ? "/mfa" : `/mfa?next=${encodeURIComponent(target)}`);
  }
  redirect(target);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(CURRENT_ORG_COOKIE);
  redirect("/login");
}

/** После приглашения: пользователь задаёт пароль (сессия уже есть — из ссылки письма). */
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
  redirect("/");
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
