import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";

import type { Database } from "./database.types";

/** Пути, доступные без входа. /auth/signout — выход; писем со ссылками нет (Д-87). */
export const PUBLIC_PATHS = ["/login", "/auth", "/api/health"] as const;

/** С временным паролем (Д-89) доступны только смена пароля и выход. */
export const PASSWORD_CHANGE_PATHS = ["/set-password", "/auth/signout", "/api/health"] as const;

function matches(paths: readonly string[], pathname: string): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isPublicPath(pathname: string): boolean {
  return matches(PUBLIC_PATHS, pathname);
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

  // Д-89: временный пароль — только смена пароля (данных и так нет: member_id() = NULL в БД).
  if (
    isSignedIn &&
    data?.claims?.app_metadata?.must_change_password &&
    !matches(PASSWORD_CHANGE_PATHS, pathname)
  ) {
    return redirectPreservingCookies(request, response, "/set-password");
  }

  // Д-90: редирект на экран MFA делает layout приложения (по my_access, который ему всё равно
  // нужен), а не proxy: proxy выполняется на краю сети, далеко от БД, и запрос к ней на каждый
  // переход стоил ~0,5 с (Д-96). Данные без aal2 и так закрыты в БД (Д-29).
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
