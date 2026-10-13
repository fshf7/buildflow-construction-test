/**
 * Создание организации и её первого администратора (org_admin). Самостоятельной регистрации нет:
 * это единственный способ завести организацию. Остальные участники — только по приглашению из приложения.
 *
 * Локально:     npm run org:create -- --name "СК Восток" --admin-email a@b.tj --admin-name "Иванов И." [--password …]
 * Staging/prod: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… NEXT_PUBLIC_SITE_URL=… \
 *               npm run org:create -- --name … --admin-email … --admin-name … --yes
 *
 * Для нелокальной БД обязателен --yes (защита от случайного запуска не туда); --password запрещён —
 * администратор получает письмо-приглашение и сам задаёт пароль и второй фактор.
 *
 * Без своего SMTP (Д-78, временно): --prompt-password — запускает сам администратор в своём терминале,
 * пароль вводится скрыто (не в аргументах, истории или логах); второй фактор — при первом входе, как обычно.
 */
import { stdin, stdout } from "node:process";

import { createClient } from "@supabase/supabase-js";

import { isLocalUrl, parseOrgCreateArgs } from "./org-create-args.mts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

/** Скрытый ввод строки в терминале (символы не отображаются). */
async function askHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY) throw new Error("--prompt-password: нужен интерактивный терминал");
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          reject(new Error("Отменено"));
          return;
        }
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function promptNewPassword(): Promise<string> {
  const first = await askHidden("Пароль администратора (не короче 10 символов): ");
  if (first.length < 10) throw new Error("Пароль короче 10 символов");
  const second = await askHidden("Повторите пароль: ");
  if (first !== second) throw new Error("Пароли не совпадают");
  return first;
}

async function main() {
  const args = parseOrgCreateArgs(process.argv.slice(2));
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");
  const local = isLocalUrl(url);

  console.log(`Supabase: ${url} (${process.env.NEXT_PUBLIC_APP_ENV ?? "окружение не указано"})`);
  console.log(`Организация: «${args.name}», администратор: ${args.adminName} <${args.adminEmail}>`);

  if (!local && !args.yes) {
    throw new Error("Нелокальная БД: проверьте адрес выше и повторите с флагом --yes.");
  }
  if (!local && args.password) {
    throw new Error("--password разрешён только для локальной БД.");
  }

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Пользователь: существующий (например, уже в другой организации) или новый.
  const { data: existingId, error: findError } = await admin.rpc("find_user_id_by_email", {
    p_email: args.adminEmail,
  });
  if (findError) throw findError;

  let userId = existingId as string | null;
  const password =
    args.password ?? (!userId && args.promptPassword ? await promptNewPassword() : undefined);
  if (!userId && password) {
    const { data, error } = await admin.auth.admin.createUser({
      email: args.adminEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: args.adminName },
    });
    if (error) throw error;
    userId = data.user.id;
  } else if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(args.adminEmail, {
      data: { full_name: args.adminName },
      redirectTo: siteUrl,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(
      "Отправлено письмо-приглашение: администратор задаст пароль и подключит второй фактор.",
    );
  } else {
    console.log("Пользователь уже существует — назначаем администратором новой организации.");
  }

  // 2. Организация, роли, матрица прав, единицы измерения, членство org_admin — одной транзакцией.
  const { data: orgId, error } = await admin.rpc("create_organization", {
    p_name: args.name,
    p_admin_user_id: userId,
    p_admin_full_name: args.adminName,
    p_admin_email: args.adminEmail,
  });
  if (error) throw error;

  console.log(`Готово. organization_id = ${orgId as string}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
