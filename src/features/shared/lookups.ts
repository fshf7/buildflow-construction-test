import "server-only";

import { createClient } from "@/lib/supabase/server";

export type Option = { id: string; label: string };
export type MaterialOption = { id: string; name: string; unitId: string; unit: string };

/** Активные объекты, доступные пользователю (RLS). */
export async function listProjectOptions(orgId: string): Promise<Option[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("status", "ACTIVE")
    .order("code");
  if (error) throw new Error(error.message);
  return data.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
}

export async function listMaterialOptions(orgId: string): Promise<MaterialOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("id, name, unit_id, units_of_measure(code)")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data.map((m) => ({
    id: m.id,
    name: m.name,
    unitId: m.unit_id,
    unit: m.units_of_measure?.code ?? "",
  }));
}

export async function listSupplierOptions(orgId: string): Promise<Option[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data.map((s) => ({ id: s.id, label: s.name }));
}

export async function listUnitOptions(orgId: string): Promise<Option[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units_of_measure")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .order("code");
  if (error) throw new Error(error.message);
  return data.map((u) => ({ id: u.id, label: `${u.code} — ${u.name}` }));
}

export async function listCrewOptions(orgId: string): Promise<Option[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crews")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data.map((c) => ({ id: c.id, label: c.name }));
}

export type BlockOption = { id: string; name: string; floors: { id: string; name: string }[] };

export async function listBlockOptions(projectId: string): Promise<BlockOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blocks")
    .select("id, name, sort_order, floors(id, name, sort_order)")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  return data.map((b) => ({
    id: b.id,
    name: b.name,
    floors: [...b.floors]
      .sort(
        (x, y) =>
          x.sort_order - y.sort_order || x.name.localeCompare(y.name, "ru", { numeric: true }),
      )
      .map((f) => ({ id: f.id, name: f.name })),
  }));
}

/**
 * Ответственный в расходе (Д-100) — бригадир: бригада из «Бригад», подпись — бригадир
 * («Часур кл»), если указан, иначе название бригады.
 */
export async function listResponsibleOptions(orgId: string): Promise<Option[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crews")
    .select("id, name, leader_name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data
    .map((c) => {
      const leader = c.leader_name?.trim();
      return {
        id: c.id,
        label: leader && leader !== c.name ? `${leader} (${c.name})` : c.name,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
