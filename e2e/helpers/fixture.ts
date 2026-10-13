import { createClient } from "@supabase/supabase-js";

import { LOCAL_ORG_NAME, LOCAL_STOREKEEPER } from "../../scripts/local-admin.mts";
import { readLocalSupabase } from "../../scripts/local-supabase.mts";

/**
 * Свой объект на каждый прогон (service_role): блок, этаж, бригада, два материала, два поставщика;
 * кладовщик назначен. Уникальные имена — тесты не мешают друг другу и повторным запускам.
 */
export async function createWarehouseFixture() {
  const local = readLocalSupabase();
  const db = createClient(local.apiUrl, local.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Миллисекунды + случайный суффикс: параллельные воркеры не совпадают по коду объекта.
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const one = async <T>(
    q: PromiseLike<{ data: T; error: { message: string } | null }>,
  ): Promise<NonNullable<T>> => {
    const { data, error } = await q;
    if (error || !data) throw new Error(error?.message ?? "пустой ответ");
    return data as NonNullable<T>;
  };

  const org = await one(db.from("organizations").select("id").eq("name", LOCAL_ORG_NAME).single());
  const project = await one(
    db
      .from("projects")
      .insert({ organization_id: org.id, code: `E${run}`, name: `Объект ${run}` })
      .select("id, code, name")
      .single(),
  );
  const block = await one(
    db
      .from("blocks")
      .insert({ organization_id: org.id, project_id: project.id, name: "Блок Б" })
      .select("id")
      .single(),
  );
  await one(
    db
      .from("floors")
      .insert({ organization_id: org.id, project_id: project.id, block_id: block.id, name: "5" })
      .select("id"),
  );
  const member = await one(
    db
      .from("organization_members")
      .select("id")
      .eq("organization_id", org.id)
      .eq("email", LOCAL_STOREKEEPER.email)
      .single(),
  );
  await one(
    db
      .from("project_members")
      .insert({ organization_id: org.id, project_id: project.id, member_id: member.id })
      .select("id"),
  );
  const crew = await one(
    db
      .from("crews")
      .insert({ organization_id: org.id, name: `Бригада ${run}` })
      .select("id, name")
      .single(),
  );
  const kg = await one(
    db
      .from("units_of_measure")
      .select("id")
      .eq("organization_id", org.id)
      .eq("code", "кг")
      .single(),
  );
  const cement = `Цемент ${run}`;
  const sand = `Песок ${run}`;
  await one(
    db
      .from("materials")
      .insert([
        { organization_id: org.id, name: cement, unit_id: kg.id },
        { organization_id: org.id, name: sand, unit_id: kg.id },
      ])
      .select("id"),
  );
  const s1 = `Цемзавод ${run}`;
  const s2 = `Карьер ${run}`;
  await one(
    db
      .from("suppliers")
      .insert([
        { organization_id: org.id, name: s1 },
        { organization_id: org.id, name: s2 },
      ])
      .select("id"),
  );

  return {
    projectId: project.id,
    projectLabel: `${project.code} — ${project.name}`,
    crew: crew.name,
    block: "Блок Б",
    floor: "5",
    cement,
    sand,
    s1,
    s2,
  };
}

/** Одноразовый участник организации (тесты, меняющие пароль или MFA, — не мешают общим пользователям). */
export async function createThrowawayMember(
  role: "warehouse" | "foreman" | "cashier" = "warehouse",
) {
  const local = readLocalSupabase();
  const db = createClient(local.apiUrl, local.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@buildflow.local`;
  const password = "buildflow-local";
  // Уникальное имя — по нему тест находит участника в списке.
  const fullName = `Временный ${email.slice(4, 14)}`;
  const { data: user, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const { data: org } = await db
    .from("organizations")
    .select("id")
    .eq("name", LOCAL_ORG_NAME)
    .single();
  const { data: member, error: mError } = await db
    .from("organization_members")
    .insert({
      organization_id: org!.id,
      user_id: user.user.id,
      full_name: fullName,
      email,
      all_projects: role === "cashier",
    })
    .select("id")
    .single();
  if (mError) throw mError;
  const { data: roleRow } = await db
    .from("roles")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("code", role)
    .single();
  const { error: rError } = await db
    .from("member_roles")
    .insert({ organization_id: org!.id, member_id: member.id, role_id: roleRow!.id });
  if (rError) throw rError;
  return { email, password, fullName };
}

/** Касса для E2E финансов (баланс — только через «Ввод остатков» или операции). */
export async function createCashAccount(name: string) {
  const local = readLocalSupabase();
  const db = createClient(local.apiUrl, local.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await db
    .from("organizations")
    .select("id")
    .eq("name", LOCAL_ORG_NAME)
    .single();
  const { data, error } = await db
    .from("cash_accounts")
    .insert({ organization_id: org!.id, name, currency: "TJS" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
