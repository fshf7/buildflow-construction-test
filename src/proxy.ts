import { NextRequest } from "next/server";

import { env } from "@/env";
import { buildCsp, newNonce, securityHeaders } from "@/lib/security/headers";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: бывший middleware.ts называется proxy.ts.
export async function proxy(request: NextRequest) {
  // Д-81: CSP с nonce на запрос — Next.js ставит nonce своим скриптам, увидев CSP в заголовках запроса.
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    dev: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = await updateSession(new NextRequest(request, { headers: requestHeaders }));
  const hsts = env.NEXT_PUBLIC_APP_ENV !== "local";
  for (const [key, value] of Object.entries(securityHeaders({ csp, hsts }))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    // Всё, кроме статики и картинок.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
