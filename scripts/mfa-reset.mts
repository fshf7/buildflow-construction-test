/**
 * Сброс второго фактора пользователю серверным скриптом (Д-46) — прежде всего администратору,
 * потерявшему телефон: в приложении себе сбросить нельзя.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
 *     npm run mfa:reset -- --email admin@example.tj --reason "Потерян телефон, заявка №…" --yes
 *
 * Удаляет факторы, завершает все сессии, пишет MFA_RESET в аудит всех организаций пользователя.
 */
import { createClient } from "@supabase/supabase-js";

import { parseMfaResetArgs } from "./mfa-reset-args.mts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

async function main() {
  const args = parseMfaResetArgs(process.argv.slice(2));
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");

  console.log(`Supabase: ${url} (${process.env.NEXT_PUBLIC_APP_ENV ?? "окружение не указано"})`);
  console.log(`Сброс второго фактора: ${args.email}. Причина: ${args.reason}`);

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("reset_user_mfa_by_service", {
    p_email: args.email,
    p_reason: args.reason,
  });
  if (error) {
    throw new Error(
      error.message === "BF_USER_NOT_FOUND"
        ? "Пользователь с таким email не найден"
        : error.message,
    );
  }
  console.log(
    `Готово: удалено факторов — ${data as number}. Все сессии завершены; при следующем входе пользователь подключит MFA заново.`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
