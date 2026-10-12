import "server-only";

import { isRoleCode, type RoleCode } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type MemberRow = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  allProjects: boolean;
  invitedAt: string | null;
  roles: RoleCode[];
  projectIds: string[];
};

/** Участники организации с ролями и объектами. Доступ — RLS (участники видят коллег). */
export async function listMembers(orgId: string): Promise<MemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select(
      "id, user_id, full_name, email, phone, is_active, all_projects, invited_at, member_roles(roles(code)), project_members(project_id)",
    )
    .eq("organization_id", orgId)
    .order("full_name");
  if (error) throw new Error(error.message);

  return data.map((m) => ({
    id: m.id,
    userId: m.user_id,
    fullName: m.full_name,
    email: m.email,
    phone: m.phone,
    isActive: m.is_active,
    allProjects: m.all_projects,
    invitedAt: m.invited_at,
    roles: m.member_roles
      .map((mr) => mr.roles?.code)
      .filter((c): c is RoleCode => typeof c === "string" && isRoleCode(c)),
    projectIds: m.project_members.map((pm) => pm.project_id),
  }));
}

export async function getMember(orgId: string, memberId: string): Promise<MemberRow | null> {
  const members = await listMembers(orgId);
  return members.find((m) => m.id === memberId) ?? null;
}

export type ProjectOption = { id: string; code: string; name: string };

/** Все объекты организации для назначения (администратор видит все — all_projects). */
export async function listProjectOptions(orgId: string): Promise<ProjectOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("status", "ACTIVE")
    .order("code");
  if (error) throw new Error(error.message);
  return data;
}
