import "server-only";

import { createClient } from "@/lib/supabase/server";

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
