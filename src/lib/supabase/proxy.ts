import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";

import type { Database } from "./database.types";

/** Пути, доступные без входа. /auth/confirm принимает ссылки из писем (приглашение, восстановление). */
export const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth", "/api/health"] as const;

/** Пути, доступные вошедшему пользователю без второго фактора (иначе его негде подключить). */
export const MFA_EXEMPT_PATHS = [
  "/mfa",
  "/set-password",
  "/reset-password",
  "/no-access",
  "/auth",
] as const;

function matches(paths: readonly string[], pathname: string): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isPublicPath(pathname: string): boolean {
  return matches(PUBLIC_PATHS, pathname);
}

export function isMfaExemptPath(pathname: string): boolean {
  return matches(MFA_EXEMPT_PATHS, pathname) || isPublicPath(pathname);
}

/**
 * Обновляет сессию Supabase (refresh-токен → новые cookie) и решает, пускать ли запрос.
 * Это первичная защита навигации; авторизация данных — в server actions и RLS.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Ответы с auth-cookie не должны кэшироваться CDN.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Между созданием клиента и getClaims() ничего не вставлять: здесь обновляется сессия.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!isSignedIn && !isPublicPath(pathname)) {
    return redirectPreservingCookies(request, response, "/login", pathname);
  }
  if (isSignedIn && pathname === "/login") {
    return redirectPreservingCookies(request, response, "/");
  }

  // Д-29: org_admin / accountant / cashier без второго фактора — только на экран MFA.
  // RLS и так не отдаст им данные без aal2; редирект — чтобы человек понял, что делать.
  if (isSignedIn && data?.claims?.aal !== "aal2" && !isMfaExemptPath(pathname)) {
    const { data: requiresMfa, error } = await supabase.rpc("current_user_requires_mfa");
    if (error || requiresMfa) {
      return redirectPreservingCookies(request, response, "/mfa", pathname);
    }
  }

  return response;
}

function redirectPreservingCookies(
  request: NextRequest,
  from: NextResponse,
  to: string,
  next?: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = to;
  url.search = "";
  if (next && next !== "/") url.searchParams.set("next", next);
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  // Переносим только запрет кэширования; служебные x-middleware-* заголовки next() сломали бы редирект.
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}
