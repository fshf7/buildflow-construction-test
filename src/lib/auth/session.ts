import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string | null;
};

/**
 * Текущий пользователь по проверенному JWT (getClaims проверяет подпись).
 * Кэш React — в пределах одного запроса, между пользователями ничего не кэшируется.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const claims = data.claims;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    fullName: typeof meta.full_name === "string" ? meta.full_name : null,
  };
});

/** Для страниц и действий, требующих входа. Права на операции проверяет lib/auth/guard (следующая фаза). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
