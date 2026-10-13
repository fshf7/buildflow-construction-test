/**
 * Заголовки безопасности (Д-81). CSP со случайным nonce на каждый запрос: Next.js сам ставит его
 * своим скриптам, если CSP передан в заголовке запроса. Стили — 'unsafe-inline' (inline-стили
 * компонентов, например уведомлений); скрипты — только с nonce.
 */
export function buildCsp(opts: {
  nonce: string;
  supabaseUrl: string;
  sentryDsn?: string;
  dev: boolean;
}): string {
  const supabase = new URL(opts.supabaseUrl).origin;
  const sentry = opts.sentryDsn ? sentryOrigin(opts.sentryDsn) : null;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic': скрипты, загруженные доверенными (с nonce), тоже доверенные.
    "script-src": [
      "'self'",
      `'nonce-${opts.nonce}'`,
      "'strict-dynamic'",
      ...(opts.dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase, ...(sentry ? [sentry] : []), ...(opts.dev ? ["ws:"] : [])],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };
  const csp = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!opts.dev) csp.push("upgrade-insecure-requests");
  return csp.join("; ");
}

/** Хост приёма событий из DSN Sentry (https://<ключ>@oXXX.ingest.sentry.io/<проект>). */
export function sentryOrigin(dsn: string): string | null {
  try {
    const url = new URL(dsn);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function securityHeaders(opts: { csp: string; hsts: boolean }): Record<string, string> {
  return {
    "Content-Security-Policy": opts.csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Фото с телефона — через <input type=file capture>, разрешение камеры странице не нужно.
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    ...(opts.hsts ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
  };
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
