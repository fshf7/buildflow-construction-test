/**
 * Создание организации и её первого администратора (org_admin). Самостоятельной регистрации нет:
 * это единственный способ завести организацию. Остальные участники — только по приглашению из приложения.
 *
 * Локально:     npm run org:create -- --name "СК Восток" --admin-login +992901234567 --admin-name "Иванов И." [--password …]
 * Staging/prod: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
 *               npm run org:create -- --name … --admin-login … --admin-name … --yes [--prompt-password]
 *
 * Для нелокальной БД обязателен --yes (защита от случайного запуска не туда); --password запрещён.
 * Писем нет (Д-87): без --prompt-password выдаётся временный пароль (показ один раз) с обязательной
 * сменой при первом входе.
 *
 * --prompt-password: запускает сам администратор в своём терминале, пароль вводится скрыто
 * (не в аргументах, истории или логах); второй фактор — при первом входе, как обычно.
 */
import { stdin, stdout } from "node:process";

import { createClient } from "@supabase/supabase-js";

import {
  generateTemporaryPassword,
  isEmailLogin,
  loginToAuthEmail,
  normalizeLogin,
} from "../src/lib/auth/login.ts";

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
  const local = isLocalUrl(url);

  console.log(`Supabase: ${url} (${process.env.NEXT_PUBLIC_APP_ENV ?? "окружение не указано"})`);
  console.log(
    `Организация: «${args.name}», администратор: ${args.adminName}, логин ${args.adminLogin}`,
  );

  if (!local && !args.yes) {
    throw new Error("Нелокальная БД: проверьте адрес выше и повторите с флагом --yes.");
  }
  if (!local && args.password) {
    throw new Error("--password разрешён только для локальной БД.");
  }

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 0. Повторный запуск не должен создать вторую организацию с тем же названием — проверяем до любых записей.
  const { data: sameName, error: sameNameError } = await admin
    .from("organizations")
    .select("id")
    .ilike("name", args.name.replace(/[%_\\]/g, "\\$&"));
  if (sameNameError) throw sameNameError;
  if (sameName.length > 0) {
    throw new Error(
      `Организация «${args.name}» уже существует (organization_id = ${sameName[0]!.id}). Ничего не создано.`,
    );
  }

  // 1. Пользователь: существующий (например, уже в другой организации) или новый. Писем нет (Д-87):
  //    логин → техническая почта; пароль — введённый оператором или временный с обязательной сменой.
  const emailLogin = isEmailLogin(args.adminLogin);
  const authEmail = loginToAuthEmail(args.adminLogin);
  const { data: existingId, error: findError } = await admin.rpc("find_user_id_by_email", {
    p_email: authEmail,
  });
  if (findError) throw findError;

  let userId = existingId as string | null;
  // Пользователь, созданный этим запуском, — откатываем, если организация не создастся.
  let createdUserId: string | null = null;
  let temporaryPassword: string | null = null;
  const rollback = async (reason: string) => {
    if (!createdUserId) return;
    const { error: rollbackError } = await admin.auth.admin.deleteUser(createdUserId);
    console.error(
      rollbackError
        ? `${reason}; пользователя ${args.adminLogin} удалить не удалось: ${rollbackError.message}`
        : `${reason}; созданный пользователь ${args.adminLogin} удалён.`,
    );
  };
  if (!userId) {
    const chosen = args.password ?? (args.promptPassword ? await promptNewPassword() : undefined);
    temporaryPassword = chosen ? null : generateTemporaryPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: authEmail,
      password: chosen ?? temporaryPassword!,
      email_confirm: true, // писем нет: техническая почта (.internal) не доставляется
      user_metadata: { full_name: args.adminName },
      app_metadata: temporaryPassword ? { must_change_password: true } : {},
    });
    if (error) throw error;
    userId = data.user.id;
    createdUserId = userId;
    if (!emailLogin) {
      const { error: loginError } = await admin.rpc("register_login", {
        p_user_id: userId,
        p_login: normalizeLogin(args.adminLogin),
      });
      if (loginError) {
        await rollback("Логин не зарегистрирован");
        throw loginError;
      }
    }
  } else {
    console.log("Пользователь уже существует — назначаем администратором новой организации.");
  }

  // 2. Организация, роли, матрица прав, единицы измерения, членство org_admin — одной транзакцией.
  const { data: orgId, error } = await admin.rpc("create_organization", {
    p_name: args.name,
    p_admin_user_id: userId,
    p_admin_full_name: args.adminName,
    p_admin_email: (emailLogin ? args.adminLogin.toLowerCase() : null) as string,
  });
  if (error) {
    await rollback("Организация не создана");
    throw error;
  }

  if (temporaryPassword) {
    // Показ один раз — в терминале того, кто создаёт организацию (Д-88). Нигде не сохраняется.
    console.log(`Логин: ${args.adminLogin}`);
    console.log(`Временный пароль (показан один раз): ${temporaryPassword}`);
    console.log("При первом входе администратор задаст свой пароль и подключит второй фактор.");
  }
  console.log(`Готово. organization_id = ${orgId as string}`);
}

main().catch((err: unknown) => {
  // Ошибки Supabase — простые объекты с message, не Error: печатаем текст в любом случае.
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  console.error(`Ошибка: ${message || "неизвестная"}`);
  process.exit(1);
});
