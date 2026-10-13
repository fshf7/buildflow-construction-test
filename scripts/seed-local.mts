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

import {
  LOCAL_ACCOUNTANT,
  LOCAL_ADMIN,
  LOCAL_CASHIER,
  LOCAL_FOREMAN,
  LOCAL_MEMBERS,
  LOCAL_ORG_NAME,
  LOCAL_STOREKEEPER,
} from "./local-admin.mts";
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
      all_projects: account.role === "accountant" || account.role === "cashier",
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

/**
 * Демо-объект для ручной проверки склада: блоки и этажи, бригада, материалы, поставщики;
 * кладовщик и прораб назначены на объект. Создаётся один раз.
 */
async function ensureDemoProject(
  admin: SupabaseClient,
  orgId: string,
  adminId: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("organization_id", orgId)
    .eq("code", "DEMO")
    .maybeSingle();
  if (existing) return;

  const one = async <T,>(
    q: PromiseLike<{ data: T; error: { message: string } | null }>,
  ): Promise<NonNullable<T>> => {
    const { data, error } = await q;
    if (error || !data) throw new Error(error?.message ?? "пустой ответ");
    return data as NonNullable<T>;
  };

  const project = await one(
    admin
      .from("projects")
      .insert({ organization_id: orgId, code: "DEMO", name: "ЖК Демо", created_by: adminId })
      .select("id")
      .single(),
  );
  const block = await one(
    admin
      .from("blocks")
      .insert({ organization_id: orgId, project_id: project.id, name: "Блок А" })
      .select("id")
      .single(),
  );
  await one(
    admin
      .from("floors")
      .insert(
        ["1", "2", "3"].map((name, i) => ({
          organization_id: orgId,
          project_id: project.id,
          block_id: block.id,
          name,
          sort_order: i,
        })),
      )
      .select("id"),
  );
  const members = await one(
    admin
      .from("organization_members")
      .select("id, email")
      .eq("organization_id", orgId)
      .in("email", [LOCAL_STOREKEEPER.email, LOCAL_FOREMAN.email]),
  );
  await one(
    admin
      .from("project_members")
      .insert(
        members.map((m) => ({ organization_id: orgId, project_id: project.id, member_id: m.id })),
      )
      .select("id"),
  );
  const foreman = members.find((m) => m.email === LOCAL_FOREMAN.email);
  await one(
    admin
      .from("crews")
      .insert({
        organization_id: orgId,
        name: "Бригада Демо",
        leader_name: "Каримов",
        foreman_member_id: foreman?.id,
      })
      .select("id"),
  );

  const units = await one(
    admin.from("units_of_measure").select("id, code").eq("organization_id", orgId),
  );
  const unit = (code: string) => units.find((u) => u.code === code)!.id;
  await one(
    admin
      .from("materials")
      .insert([
        { organization_id: orgId, name: "Цемент М400", unit_id: unit("меш"), category: "Сыпучие" },
        { organization_id: orgId, name: "Песок речной", unit_id: unit("т"), category: "Сыпучие" },
        {
          organization_id: orgId,
          name: "Арматура А500 12 мм",
          unit_id: unit("т"),
          category: "Металл",
        },
        { organization_id: orgId, name: "Кирпич М150", unit_id: unit("шт"), category: "Стеновые" },
      ])
      .select("id"),
  );
  await one(
    admin
      .from("suppliers")
      .insert([
        { organization_id: orgId, name: "ООО «СтройСнаб»", phone: "+992 900 00 00 01" },
        { organization_id: orgId, name: "ИП «Карьер»", phone: "+992 900 00 00 02" },
      ])
      .select("id"),
  );
  console.log("Создан демо-объект DEMO с бригадой, материалами и поставщиками");
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

  await ensureDemoProject(admin, org.id, adminId);

  if (resetMfa) {
    await deleteFactors(admin, adminId);
    await deleteFactors(admin, await ensureUser(admin, LOCAL_ACCOUNTANT));
    await deleteFactors(admin, await ensureUser(admin, LOCAL_CASHIER));
  }
}

// Запуск как скрипта (а не импорт).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedLocal({ resetMfa: process.argv.includes("--reset-mfa") }).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
