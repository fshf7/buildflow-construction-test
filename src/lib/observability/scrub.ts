import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Очистка событий Sentry (Д-83): ни персональных данных, ни сумм. Из текстов вырезаются email,
 * телефоны и любые числа длиной от 4 знаков или с дробной частью (суммы, количества, номера);
 * запрос, cookies, заголовки и пользователь (кроме внутреннего uuid) не отправляются.
 */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const PHONE = /\+?\d[\d\s()\- ]{7,}\d/g;
const NUMBER = /\d[\d\s  ]*(?:[.,]\d+)?/g;

export function scrubText(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[телефон]")
    .replace(NUMBER, (m) => (/[.,]\d/.test(m) || m.replace(/\D/g, "").length >= 4 ? "[число]" : m));
}

const UUID = /^[0-9a-f-]{36}$/i;

export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  // Только внутренний идентификатор пользователя — без email, имени и IP.
  event.user =
    event.user?.id && UUID.test(String(event.user.id)) ? { id: String(event.user.id) } : undefined;
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  delete event.extra;
  if (event.contexts) delete event.contexts.state;
  event.breadcrumbs = event.breadcrumbs
    ?.map(scrubBreadcrumb)
    .filter((b): b is Breadcrumb => b !== null);
  return event;
}

export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  // Консоль может содержать что угодно — не отправляем.
  if (b.category === "console") return null;
  const out: Breadcrumb = { ...b };
  if (out.message) out.message = scrubText(out.message);
  if (out.data) {
    const url = typeof out.data.url === "string" ? out.data.url.split("?")[0] : undefined;
    out.data = {
      ...(url ? { url } : {}),
      ...(out.data.method ? { method: out.data.method } : {}),
      ...(out.data.status_code ? { status_code: out.data.status_code } : {}),
    };
  }
  return out;
}

/** Общие настройки инициализации для клиента и сервера. Без DSN Sentry не включается. */
export function sentryOptions(dsn: string | undefined, environment: string) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
