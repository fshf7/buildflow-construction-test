import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

/** Лимиты (Д-80): [попыток, окно в секундах]. */
export const LIMITS = {
  login_ip: [10, 15 * 60],
  login_id: [5, 15 * 60],
  reset_ip: [10, 60 * 60],
  reset_email: [3, 60 * 60],
  export_user: [30, 10 * 60],
  upload_user: [60, 10 * 60],
  import_user: [10, 60 * 60],
  health_ip: [120, 60],
} as const satisfies Record<string, readonly [number, number]>;

export type LimitName = keyof typeof LIMITS;

/** Ключ счётчика: действие + sha256 значения — в БД нет открытых email и IP. */
export function bucketKey(name: LimitName, value: string): string {
  const digest = createHash("sha256")
    .update(`${name}\u0000${value.trim().toLowerCase()}`)
    .digest("hex");
  return `${name}:${digest}`;
}

/** IP клиента за прокси Vercel: первый адрес из x-forwarded-for, иначе x-real-ip. */
export function clientIpFrom(h: Pick<Headers, "get">): string {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

/**
 * Множитель лимитов для локальных E2E (десятки входов с одного адреса за минуты). Действует ТОЛЬКО
 * в окружении local — на staging и production лимиты всегда настоящие.
 */
export function limitMultiplier(env: Record<string, string | undefined> = process.env): number {
  if (env.NEXT_PUBLIC_APP_ENV !== "local") return 1;
  const m = Number(env.RATE_LIMIT_MULTIPLIER);
  return Number.isFinite(m) && m >= 1 ? Math.floor(m) : 1;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/** Сколько секунд до конца текущего окна (окна выровнены по эпохе, как в rate_limit_hit). */
export function secondsToWindowEnd(windowSec: number, nowMs = Date.now()): number {
  const now = Math.floor(nowMs / 1000);
  return windowSec - (now % windowSec);
}

/**
 * Засчитывает попытку по всем ключам; запрещено, если исчерпан любой. Сбой БД не блокирует
 * пользователя (доступность важнее), но пишется в лог.
 */
export async function rateLimit(
  checks: { name: LimitName; value: string }[],
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const multiplier = limitMultiplier();
  let retryAfterSec = 0;
  for (const { name, value } of checks) {
    const [max, windowSec] = LIMITS[name];
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_bucket: bucketKey(name, value),
      p_max: max * multiplier,
      p_window_seconds: windowSec,
    });
    if (error) {
      console.warn("rate_limit_hit:", name, error.code);
      continue;
    }
    if (data === false) retryAfterSec = Math.max(retryAfterSec, secondsToWindowEnd(windowSec));
  }
  return retryAfterSec > 0 ? { ok: false, retryAfterSec } : { ok: true };
}

export function tooManyMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Слишком много попыток. Повторите через ${minutes} мин.`;
}
