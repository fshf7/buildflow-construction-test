import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { WorkRate } from "./rates";

export type CrewMember = {
  id: string;
  fullName: string;
  phone: string | null;
  position: string | null;
  isActive: boolean;
};

export type RateRow = WorkRate & { projectLabel: string | null; note: string | null };

/** Тарифы, видимые пользователю (RLS: crews.view и доступ к объекту тарифа). */
export async function listRates(orgId: string, crewId?: string): Promise<RateRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("work_rates")
    .select(
      "id, crew_id, project_id, work_type, unit_id, rate, currency, valid_from, note, units_of_measure(code), projects(code, name)",
    )
    .eq("organization_id", orgId)
    .order("work_type")
    .order("valid_from", { ascending: false });
  if (crewId) q = q.eq("crew_id", crewId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map((r) => ({
    id: r.id,
    crewId: r.crew_id,
    projectId: r.project_id,
    workType: r.work_type,
    unitId: r.unit_id,
    unit: r.units_of_measure?.code ?? "",
    rate: Number(r.rate),
    currency: r.currency,
    validFrom: r.valid_from,
    note: r.note,
    projectLabel: r.projects ? `${r.projects.code} — ${r.projects.name}` : null,
  }));
}

export async function getCrew(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crews")
    .select(
      "id, name, leader_name, phone, is_active, organization_members(full_name), crew_members(id, full_name, phone, position, is_active)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    leaderName: data.leader_name,
    phone: data.phone,
    isActive: data.is_active,
    foremanName: data.organization_members?.full_name ?? null,
    members: data.crew_members
      .map((m): CrewMember => ({
        id: m.id,
        fullName: m.full_name,
        phone: m.phone,
        position: m.position,
        isActive: m.is_active,
      }))
      .sort(
        (a, b) =>
          Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName, "ru"),
      ),
  };
}
