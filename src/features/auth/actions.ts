"use server";

import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

import { loginSchema } from "./schemas";

export type SignInResult = { ok: false; error: string };

export async function signIn(input: unknown, next?: string): Promise<SignInResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Проверьте email и пароль" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Не раскрываем, что именно неверно: email или пароль.
    return { ok: false, error: "Неверный email или пароль" };
  }

  redirect(safeNextPath(next));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
