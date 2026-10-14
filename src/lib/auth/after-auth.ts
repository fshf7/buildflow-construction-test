import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { safeNextPath } from "./redirect";

/**
 * Переход после входа или смены пароля. redirect из server action отдаёт страницу в том же
 * ответе, минуя proxy.ts, поэтому требование второго фактора (Д-29, Д-42) проверяем здесь.
 */
export async function redirectAfterAuth(next?: string | null): Promise<never> {
  const target = safeNextPath(next);
  const supabase = await createClient();
  // Д-89: временный пароль — сначала смена пароля, потом всё остальное (включая MFA).
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.app_metadata?.must_change_password) redirect("/set-password");
  const { data: requiresMfa } = await supabase.rpc("current_user_requires_mfa");
  if (requiresMfa) {
    redirect(target === "/" ? "/mfa" : `/mfa?next=${encodeURIComponent(target)}`);
  }
  redirect(target);
}
