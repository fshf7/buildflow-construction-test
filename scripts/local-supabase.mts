/**
 * Доступ к ЛОКАЛЬНОМУ Supabase для служебных скриптов.
 * Ключи берутся из `supabase status` (локальный Docker-стек), а не из env: так скрипт физически
 * не может попасть в staging/production, даже если в окружении лежат их ключи.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

export type LocalSupabase = { apiUrl: string; secretKey: string; publishableKey: string };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function assertLocal(apiUrl: string, appEnv: string | undefined): void {
  if (appEnv === "staging" || appEnv === "production") {
    throw new Error(`Отказ: NEXT_PUBLIC_APP_ENV=${appEnv}. Скрипт только для локальной БД.`);
  }
  const host = new URL(apiUrl).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Отказ: ${apiUrl} — не локальный Supabase. Скрипт только для локальной БД.`);
  }
}

export function readLocalSupabase(): LocalSupabase {
  const bin = path.resolve("node_modules/.bin/supabase");
  let out: string;
  try {
    out = execFileSync(bin, ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Локальный Supabase не запущен: выполните `npm run db:start`.");
  }
  const vars = Object.fromEntries(
    out
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
  const apiUrl = vars.API_URL;
  const secretKey = vars.SECRET_KEY ?? vars.SERVICE_ROLE_KEY;
  const publishableKey = vars.PUBLISHABLE_KEY ?? vars.ANON_KEY ?? "";
  if (!apiUrl || !secretKey)
    throw new Error("Не удалось прочитать API_URL/SECRET_KEY из `supabase status`.");
  assertLocal(apiUrl, process.env.NEXT_PUBLIC_APP_ENV);
  return { apiUrl, secretKey, publishableKey };
}
