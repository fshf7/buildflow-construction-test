import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: readonly EmailOtpType[] = ["invite", "recovery", "email", "magiclink"];

/**
 * Ссылка из письма (шаблон supabase/templates/invite.html): ?token_hash=…&type=invite&next=/set-password.
 * Проверяем токен на сервере — сессия ставится в cookie (PKCE-совместимо, без токенов в URL-фрагменте).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("error", "link");
  return NextResponse.redirect(url);
}
