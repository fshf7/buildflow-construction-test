import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ProjectListRow = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  status: "ACTIVE" | "ARCHIVED";
  startDate: string | null;
  endDate: string | null;
  warehouseName: string | null;
};

/** Видимые пользователю объекты: RLS оставляет только назначенные (US-09). */
export async function listProjects(orgId: string): Promise<ProjectListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, code, name, address, status, start_date, end_date, warehouses(name)")
    .eq("organization_id", orgId)
    .order("status")
    .order("code");
  if (error) throw new Error(error.message);
  return data.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    address: p.address,
    status: p.status,
    startDate: p.start_date,
    endDate: p.end_date,
    warehouseName: p.warehouses[0]?.name ?? null, // один склад на объект (Д-22)
  }));
}

export type ProjectDetail = ProjectListRow & {
  blocks: { id: string; name: string; floors: { id: string; name: string }[] }[];
};

export async function getProject(orgId: string, id: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, code, name, address, status, start_date, end_date, warehouses(name), blocks(id, name, sort_order, floors(id, name, sort_order))",
    )
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const bySort = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru", { numeric: true });

  return {
    id: data.id,
    code: data.code,
    name: data.name,
    address: data.address,
    status: data.status,
    startDate: data.start_date,
    endDate: data.end_date,
    warehouseName: data.warehouses[0]?.name ?? null,
    blocks: [...data.blocks].sort(bySort).map((b) => ({
      id: b.id,
      name: b.name,
      floors: [...b.floors].sort(bySort).map((f) => ({ id: f.id, name: f.name })),
    })),
  };
}

export type ProjectHeader = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  label: string;
  status: "ACTIVE" | "ARCHIVED";
};

/**
 * Объект для работы «внутри объекта» (Д-94), если он виден пользователю (RLS). Организацию
 * сверяет вызывающий — так запрос идёт параллельно с my_access (Д-96).
 */
export const getProjectHeader = cache(async (id: string): Promise<ProjectHeader | null> => {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, organization_id, code, name, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? {
        id: data.id,
        organizationId: data.organization_id,
        code: data.code,
        name: data.name,
        status: data.status,
        label: `${data.code} — ${data.name}`,
      }
    : null;
});
