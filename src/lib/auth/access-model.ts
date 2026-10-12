import { z } from "zod";

import type { Permission } from "./permissions";

/** Ответ RPC public.my_access(): организации пользователя, его роли и права в каждой. */
export const accessSchema = z.object({
  aal: z.string(),
  organizations: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      member_id: z.uuid(),
      full_name: z.string(),
      all_projects: z.boolean(),
      requires_mfa: z.boolean(),
      roles: z.array(z.string()),
      permissions: z.array(z.string()),
      project_ids: z.array(z.uuid()),
    }),
  ),
});

export type Access = z.infer<typeof accessSchema>;
export type OrgAccess = Access["organizations"][number];

/** Текущая организация: выбранная пользователем (cookie), если он в ней состоит, иначе первая. */
export function pickOrganization(access: Access, preferredId?: string | null): OrgAccess | null {
  return access.organizations.find((o) => o.id === preferredId) ?? access.organizations[0] ?? null;
}

export function hasPermission(org: OrgAccess | null, permission: Permission): boolean {
  return org !== null && org.permissions.includes(permission);
}

export function hasAnyPermission(
  org: OrgAccess | null,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => hasPermission(org, p));
}
