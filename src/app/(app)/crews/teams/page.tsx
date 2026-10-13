import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { CrewsSection } from "@/features/warehouse/components/crews-section";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Бригады" };

// Справочник бригад: карточка бригады — состав и договорные тарифы.
export default async function CrewsPage() {
  const org = await requirePermission("crews.view");
  const supabase = await createClient();
  const [{ data: crews, error }, { data: members, error: mError }] = await Promise.all([
    supabase
      .from("crews")
      .select(
        "id, name, leader_name, phone, foreman_member_id, is_active, organization_members(full_name)",
      )
      .eq("organization_id", org.id)
      .order("is_active", { ascending: false })
      .order("name"),
    supabase
      .from("organization_members")
      .select("id, full_name, member_roles(roles(code))")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("full_name"),
  ]);
  if (error || mError) throw new Error((error ?? mError)!.message);
  const foremen = members
    .filter((m) => m.member_roles.some((r) => r.roles?.code === "foreman"))
    .map((m) => ({ id: m.id, label: m.full_name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Бригады"
        description="Откройте бригаду, чтобы увидеть состав и договорные тарифы."
      />
      <CrewsSection
        canManage={hasPermission(org, "crews.manage")}
        foremen={foremen}
        crews={crews.map((c) => ({
          id: c.id,
          name: c.name,
          leaderName: c.leader_name,
          phone: c.phone,
          foremanMemberId: c.foreman_member_id,
          foremanName: c.organization_members?.full_name ?? null,
          isActive: c.is_active,
        }))}
      />
    </div>
  );
}
