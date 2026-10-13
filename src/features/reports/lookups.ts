import "server-only";

import { listCrewOptions, listProjectOptions } from "@/features/shared/lookups";
import { hasPermission, type OrgAccess } from "@/lib/auth/access-model";
import { createClient } from "@/lib/supabase/server";

import type { Lookups } from "./definitions";

/** Справочники для фильтров отчётов (под RLS пользователя). */
export async function reportLookups(org: OrgAccess): Promise<Lookups> {
  const supabase = await createClient();
  const [projects, crews, accounts] = await Promise.all([
    listProjectOptions(org.id),
    hasPermission(org, "crews.view") || hasPermission(org, "stock.view")
      ? listCrewOptions(org.id)
      : Promise.resolve([]),
    hasPermission(org, "cash.view")
      ? supabase
          .from("cash_accounts")
          .select("id, name")
          .eq("organization_id", org.id)
          .order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  return {
    projects,
    crews,
    accounts: (accounts.data ?? []).map((a) => ({ id: a.id, label: a.name })),
  };
}
