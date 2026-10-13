/**
 * Локальные данные для разработки и E2E: организация «Демо-стройка» и участники разных ролей.
 * Только локальная БД (см. scripts/local-supabase.mts). В staging/production не применяется:
 * supabase/seed.sql этих данных не содержит, а скрипт отказывается работать с нелокальным адресом.
 *
 * Идемпотентен; пароли при каждом запуске возвращаются к исходным (тесты их меняют).
 * --reset-mfa удаляет второй фактор администратора и бухгалтера (E2E подключает его заново).
 */
import { pathToFileURL } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { LOCAL_ACCOUNTANT, LOCAL_ADMIN, LOCAL_MEMBERS, LOCAL_ORG_NAME } from "./local-admin.mts";
import { readLocalSupabase } from "./local-supabase.mts";

type Account = { email: string; password: string; fullName: string; role: string };

async function ensureUser(admin: SupabaseClient, account: Account): Promise<string> {
  const { data: existing, error: findError } = await admin.rpc("find_user_id_by_email", {
    p_email: account.email,
  });
  if (findError) throw findError;
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing as string, {
      password: account.password,
    });
    if (error) throw error;
    return existing as string;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.fullName },
  });
  if (error) throw error;
  console.log(`Создан ${account.email}`);
  return data.user.id;
}

async function ensureMember(
  admin: SupabaseClient,
  orgId: string,
  adminId: string,
  account: Account,
): Promise<void> {
  const userId = await ensureUser(admin, account);
  const { data: existing } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  // Прямые вставки service_role: RPC add_member требует пользователя-администратора.
  const { data: member, error } = await admin
    .from("organization_members")
    .insert({
      organization_id: orgId,
      user_id: userId,
      full_name: account.fullName,
      email: account.email,
      all_projects: account.role === "accountant",
      created_by: adminId,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("code", account.role)
    .single();
  if (roleError) throw roleError;
  const { error: mrError } = await admin.from("member_roles").insert({
    organization_id: orgId,
    member_id: member.id,
    role_id: role.id,
    created_by: adminId,
  });
  if (mrError) throw mrError;
  console.log(`${account.email} добавлен (${account.role})`);
}

async function deleteFactors(admin: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) throw error;
  for (const factor of data.factors) {
    await admin.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
  }
}

export async function seedLocal({ resetMfa = false }: { resetMfa?: boolean } = {}): Promise<void> {
  const { apiUrl, secretKey } = readLocalSupabase();
  const admin = createClient(apiUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminId = await ensureUser(admin, LOCAL_ADMIN);

  // Организация — через ту же функцию, что и npm run org:create.
  let { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("name", LOCAL_ORG_NAME)
    .maybeSingle();
  if (!org) {
    const { data: orgId, error } = await admin.rpc("create_organization", {
      p_name: LOCAL_ORG_NAME,
      p_admin_user_id: adminId,
      p_admin_full_name: LOCAL_ADMIN.fullName,
      p_admin_email: LOCAL_ADMIN.email,
    });
    if (error) throw error;
    org = { id: orgId as string };
    console.log(`Создана организация «${LOCAL_ORG_NAME}»`);
  }

  for (const account of LOCAL_MEMBERS) {
    await ensureMember(admin, org.id, adminId, account);
  }

  if (resetMfa) {
    await deleteFactors(admin, adminId);
    await deleteFactors(admin, await ensureUser(admin, LOCAL_ACCOUNTANT));
  }
}

// Запуск как скрипта (а не импорт).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedLocal({ resetMfa: process.argv.includes("--reset-mfa") }).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
