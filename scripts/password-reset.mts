/**
 * Сброс пароля серверным скриптом (Д-88) — прежде всего администратору самому себе (в приложении
 * себе нельзя) или когда администратора нет.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
 *     npm run password:reset -- --login +992901234567 --reason "Забыл пароль, заявка №…" --yes
 *
 * Завершает все сессии, пишет PASSWORD_RESET в аудит, ставит временный пароль с обязательной сменой
 * при следующем входе. Временный пароль показывается один раз — в этом терминале; нигде не сохраняется.
 */
import { createClient } from "@supabase/supabase-js";

import { generateTemporaryPassword } from "../src/lib/auth/login.ts";

import { parsePasswordResetArgs } from "./password-reset-args.mts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

async function main() {
  const args = parsePasswordResetArgs(process.argv.slice(2));
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  console.log(`Supabase: ${url} (${process.env.NEXT_PUBLIC_APP_ENV ?? "окружение не указано"})`);
  console.log(`Сброс пароля: ${args.login}. Причина: ${args.reason}`);

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userId, error } = await admin.rpc("reset_user_password_by_service", {
    p_login: args.login,
    p_reason: args.reason,
  });
  if (error) {
    throw new Error(
      error.message === "BF_USER_NOT_FOUND"
        ? "Пользователь с таким логином не найден"
        : error.message,
    );
  }
  const password = generateTemporaryPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(userId as string, {
    password,
    app_metadata: { must_change_password: true },
  });
  if (updateError)
    throw new Error(`Сессии завершены, но пароль не сменён: ${updateError.message}. Повторите.`);
  console.log(`Временный пароль (показан один раз): ${password}`);
  console.log("Все сессии завершены. При входе пользователь задаст свой пароль.");
}

main().catch((err: unknown) => {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String(err.message)
        : String(err);
  console.error(`Ошибка: ${message}`);
  process.exit(1);
});
