/**
 * Локальные данные для разработки и E2E: организация «Демо-стройка», администратор и прораб.
 * Только локальная БД (см. scripts/local-supabase.mts). В staging/production не применяется:
 * supabase/seed.sql этих данных не содержит, а скрипт отказывается работать с нелокальным адресом.
 * Идемпотентен. Флаг --reset-mfa удаляет второй фактор администратора (E2E подключает его заново).
 */
import { pathToFileURL } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { LOCAL_ADMIN, LOCAL_FOREMAN, LOCAL_ORG_NAME } from "./local-admin.mts";
import { readLocalSupabase } from "./local-supabase.mts";

type Account = { email: string; password: string; fullName: string };

async function ensureUser(admin: SupabaseClient, account: Account): Promise<string> {
  const { data: existing, error: findError } = await admin.rpc("find_user_id_by_email", {
    p_email: account.email,
  });
  if (findError) throw findError;
  if (existing) return existing as string;

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

export async function seedLocal({ resetMfa = false }: { resetMfa?: boolean } = {}): Promise<void> {
  const { apiUrl, secretKey } = readLocalSupabase();
  const admin = createClient(apiUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminId = await ensureUser(admin, LOCAL_ADMIN);
  const foremanId = await ensureUser(admin, LOCAL_FOREMAN);

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

  // Прораб: прямые вставки service_role (RPC add_member требует пользователя-администратора).
  const { data: foremanMember } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", org.id)
    .eq("user_id", foremanId)
    .maybeSingle();
  if (!foremanMember) {
    const { data: member, error } = await admin
      .from("organization_members")
      .insert({
        organization_id: org.id,
        user_id: foremanId,
        full_name: LOCAL_FOREMAN.fullName,
        email: LOCAL_FOREMAN.email,
        created_by: adminId,
      })
      .select("id")
      .single();
    if (error) throw error;
    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", org.id)
      .eq("code", "foreman")
      .single();
    if (roleError) throw roleError;
    const { error: mrError } = await admin.from("member_roles").insert({
      organization_id: org.id,
      member_id: member.id,
      role_id: role.id,
      created_by: adminId,
    });
    if (mrError) throw mrError;
    console.log(`${LOCAL_FOREMAN.email} добавлен прорабом`);
  }

  if (resetMfa) {
    const { data: factors, error } = await admin.auth.admin.mfa.listFactors({ userId: adminId });
    if (error) throw error;
    for (const factor of factors.factors) {
      await admin.auth.admin.mfa.deleteFactor({ userId: adminId, id: factor.id });
    }
  }
}

// Запуск как скрипта (а не импорт).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedLocal({ resetMfa: process.argv.includes("--reset-mfa") }).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
