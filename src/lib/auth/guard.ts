import "server-only";

import { hasAnyPermission, type OrgAccess } from "./access-model";
import { getCurrentOrg } from "./access";
import type { Permission } from "./permissions";

export type Authorized = { ok: true; org: OrgAccess } | { ok: false; error: string };

/**
 * Проверка права в server action (CLAUDE.md: права проверяются и в действиях, и в RLS).
 * Возвращает текущую организацию — действие работает только в её рамках.
 * Список прав — достаточно любого (точную проверку делает функция БД).
 */
export async function authorize(permission: Permission | readonly Permission[]): Promise<Authorized> {
  const org = await getCurrentOrg();
  if (!org) return { ok: false, error: "Вы не состоите в организации" };
  if (!hasAnyPermission(org, typeof permission === "string" ? [permission] : permission))
    return { ok: false, error: "Недостаточно прав для этого действия" };
  return { ok: true, org };
}
