import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/observability/scrub";

// Sentry на сервере (Node и edge). Без NEXT_PUBLIC_SENTRY_DSN — выключен (локально, CI).
export async function register() {
  Sentry.init(
    sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.NEXT_PUBLIC_APP_ENV ?? "local"),
  );
}

// Ошибки серверных компонентов, route handlers и server actions.
export const onRequestError = Sentry.captureRequestError;
