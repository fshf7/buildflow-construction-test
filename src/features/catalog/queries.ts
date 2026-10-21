import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ExpenseCategoryRow = {
  id: string;
  name: string;
  color: string;
  viaWarehouse: boolean;
  sortOrder: number;
  isActive: boolean;
};

/** Категории затрат (Д-97); activeOnly — для выбора в строке затрат. */
export async function listExpenseCategories(
  orgId: string,
  activeOnly = false,
): Promise<ExpenseCategoryRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("expense_categories")
    .select("id, name, color, via_warehouse, sort_order, is_active")
    .eq("organization_id", orgId)
    .order("sort_order")
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    viaWarehouse: c.via_warehouse,
    sortOrder: c.sort_order,
    isActive: c.is_active,
  }));
}

export type WorkStageRow = { id: string; name: string; sortOrder: number; isActive: boolean };

/** Этапы работ (Д-100); activeOnly — для выбора в строках склада. */
export async function listWorkStages(orgId: string, activeOnly = false): Promise<WorkStageRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("work_stages")
    .select("id, name, sort_order, is_active")
    .eq("organization_id", orgId)
    .order("sort_order")
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    sortOrder: s.sort_order,
    isActive: s.is_active,
  }));
}

export type ServiceRow = {
  id: string;
  name: string;
  unitId: string;
  unitCode: string;
  isActive: boolean;
};

/** Услуги (Д-100): кран, экскаватор, питание … */
export async function listServices(orgId: string, activeOnly = false): Promise<ServiceRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("services")
    .select("id, name, unit_id, is_active, units_of_measure(code)")
    .eq("organization_id", orgId)
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    unitId: s.unit_id,
    unitCode: s.units_of_measure?.code ?? "",
    isActive: s.is_active,
  }));
}

export type UnitRow = { id: string; code: string; name: string; decimals: number };
export type MaterialRow = {
  id: string;
  code: string | null;
  name: string;
  unitId: string;
  unitCode: string;
  category: string | null;
  isActive: boolean;
};
export type SupplierRow = {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  contactPerson: string | null;
  address: string | null;
  isActive: boolean;
};

export async function listUnits(orgId: string): Promise<UnitRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units_of_measure")
    .select("id, code, name, decimals")
    .eq("organization_id", orgId)
    .order("code");
  if (error) throw new Error(error.message);
  return data;
}

export async function listMaterials(orgId: string): Promise<MaterialRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("id, code, name, unit_id, category, is_active, units_of_measure(code)")
    .eq("organization_id", orgId)
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);
  return data.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    unitId: m.unit_id,
    unitCode: m.units_of_measure?.code ?? "",
    category: m.category,
    isActive: m.is_active,
  }));
}

export async function listSuppliers(orgId: string): Promise<SupplierRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, tax_id, phone, contact_person, address, is_active")
    .eq("organization_id", orgId)
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    taxId: s.tax_id,
    phone: s.phone,
    contactPerson: s.contact_person,
    address: s.address,
    isActive: s.is_active,
  }));
}
