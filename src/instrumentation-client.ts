import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/observability/scrub";

// Sentry в браузере: без replay и без персональных данных (Д-83).
Sentry.init(
  sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.NEXT_PUBLIC_APP_ENV ?? "local"),
);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
