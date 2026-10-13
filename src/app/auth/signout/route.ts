import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Локальный выход с очисткой cookie. Нужен, когда сессию завершили на сервере (сброс MFA,
 * выход везде — Д-47): JWT ещё валиден, и proxy.ts считает пользователя вошедшим, а Server
 * Component cookie стереть не может. Route handler — может.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url));
}
