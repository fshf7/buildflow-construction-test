/**
 * Окружение интеграционных тестов: локальный Supabase, локальные пользователи (seed-local)
 * и собственный объект теста с уникальным кодом. Готовится service_role, действия проверяются
 * от имени пользователей — через тот же API, что и приложение.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { LOCAL_ORG_NAME, LOCAL_STOREKEEPER } from "../../scripts/local-admin.mts";
import { readLocalSupabase } from "../../scripts/local-supabase.mts";
import { seedLocal } from "../../scripts/seed-local.mts";

export const local = readLocalSupabase();

export const service = createClient<Database>(local.apiUrl, local.secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function signIn(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(local.apiUrl, local.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null || result.data === undefined) throw new Error("Пустой ответ");
  return result.data as NonNullable<T>;
}

export type Fixture = {
  orgId: string;
  projectId: string;
  warehouseId: string;
  materialId: string;
  supplierId: string;
  storekeeper: SupabaseClient<Database>;
};

/** Объект теста, назначенный кладовщику; материал и поставщик — уникальные. */
export async function createFixture(tag: string): Promise<Fixture> {
  await seedLocal();
  const run = `${tag}-${Date.now().toString(36)}`;

  const org = must(
    await service.from("organizations").select("id").eq("name", LOCAL_ORG_NAME).single(),
  );
  const project = must(
    await service
      .from("projects")
      .insert({ organization_id: org.id, code: `IT-${run}`, name: `Интеграция ${run}` })
      .select("id")
      .single(),
  );
  const warehouse = must(
    await service.from("warehouses").select("id").eq("project_id", project.id).single(),
  );
  const member = must(
    await service
      .from("organization_members")
      .select("id")
      .eq("organization_id", org.id)
      .eq("email", LOCAL_STOREKEEPER.email)
      .single(),
  );
  must(
    await service
      .from("project_members")
      .insert({ organization_id: org.id, project_id: project.id, member_id: member.id })
      .select("id"),
  );
  const unit = must(
    await service
      .from("units_of_measure")
      .select("id")
      .eq("organization_id", org.id)
      .eq("code", "кг")
      .single(),
  );
  const material = must(
    await service
      .from("materials")
      .insert({ organization_id: org.id, name: `Цемент ${run}`, unit_id: unit.id })
      .select("id")
      .single(),
  );
  const supplier = must(
    await service
      .from("suppliers")
      .insert({ organization_id: org.id, name: `Поставщик ${run}` })
      .select("id")
      .single(),
  );

  return {
    orgId: org.id,
    projectId: project.id,
    warehouseId: warehouse.id,
    materialId: material.id,
    supplierId: supplier.id,
    storekeeper: await signIn(LOCAL_STOREKEEPER.email, LOCAL_STOREKEEPER.password),
  };
}

export { must };
