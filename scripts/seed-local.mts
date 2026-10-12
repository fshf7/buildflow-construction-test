/**
 * Локальные данные для разработки и E2E: пользователь admin@buildflow.local / buildflow-local.
 * Только локальная БД (см. scripts/local-supabase.mts). В staging/production не применяется:
 * supabase/seed.sql этих данных не содержит, а скрипт отказывается работать с нелокальным адресом.
 * Идемпотентен: повторный запуск ничего не дублирует.
 */
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { LOCAL_ADMIN } from "./local-admin.mts";
import { readLocalSupabase } from "./local-supabase.mts";

export async function seedLocal(): Promise<void> {
  const { apiUrl, secretKey } = readLocalSupabase();
  const admin = createClient(apiUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.auth.admin.createUser({
    email: LOCAL_ADMIN.email,
    password: LOCAL_ADMIN.password,
    email_confirm: true,
    user_metadata: { full_name: LOCAL_ADMIN.fullName },
  });
  if (error && error.code !== "email_exists") throw error;

  console.log(error ? `Пользователь ${LOCAL_ADMIN.email} уже есть` : `Создан ${LOCAL_ADMIN.email}`);
}

// Запуск как скрипта (а не импорт из Playwright globalSetup).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedLocal().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
