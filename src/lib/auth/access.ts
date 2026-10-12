import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { accessSchema, hasPermission, pickOrganization, type OrgAccess } from "./access-model";
import type { Permission } from "./permissions";

export const CURRENT_ORG_COOKIE = "bf_org";

/** Доступы текущего пользователя (один RPC на запрос). Права уже учитывают MFA (Д-29). */
export const getAccess = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_access");
  if (error) throw new Error(`my_access: ${error.message}`);
  return accessSchema.parse(data);
});

export const getCurrentOrg = cache(async (): Promise<OrgAccess | null> => {
  const [access, cookieStore] = await Promise.all([getAccess(), cookies()]);
  return pickOrganization(access, cookieStore.get(CURRENT_ORG_COOKIE)?.value);
});

/** Страницы: нет организации → экран «Нет доступа». */
export async function requireOrg(): Promise<OrgAccess> {
  const org = await getCurrentOrg();
  if (!org) redirect("/no-access");
  return org;
}

/** Страницы: нет права → экран «Нет доступа». Данные дополнительно защищены RLS. */
export async function requirePermission(permission: Permission): Promise<OrgAccess> {
  const org = await requireOrg();
  if (!hasPermission(org, permission)) redirect("/no-access?reason=forbidden");
  return org;
}
