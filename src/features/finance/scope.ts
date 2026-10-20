import "server-only";

import { redirect } from "next/navigation";

import { requireObject } from "@/features/projects/object";
import { requireOrg, requirePermission } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";
import { objectHref } from "@/lib/routes";

/**
 * Где открыты финансы (Д-94): внутри объекта (/objects/<id>/finance) — его операции, долги и
 * счета; в «Общем» (/finance) — касса без объекта. Одни и те же страницы для обоих мест.
 */
export type FinanceScope = {
  /** id объекта; null — «без объекта». */
  projectId: string | null;
  /** Базовый адрес раздела: ссылки внутри финансов строятся от него. */
  base: string;
  /** Название объекта для заголовков; null — «без объекта». */
  projectLabel: string | null;
};

export type ScopedParams<P = object> = Promise<P & { projectId?: string }>;

export function financeBase(projectId: string | null): string {
  return projectId === null ? "/finance" : objectHref(projectId, "/finance");
}

export async function financeScope(params: ScopedParams, permission?: Permission) {
  const { projectId } = await params;
  if (projectId !== undefined) {
    const { org, project } = await requireObject(projectId, permission);
    const scope: FinanceScope = {
      projectId: project.id,
      base: financeBase(project.id),
      projectLabel: project.label,
    };
    return { org, scope };
  }
  const org = permission ? await requirePermission(permission) : await requireOrg();
  const scope: FinanceScope = { projectId: null, base: "/finance", projectLabel: null };
  return { org, scope };
}

/** Документ финансов из другой области — на его адрес (как ensureDocInObject для объекта). */
export function ensureFinanceDoc(scope: FinanceScope, docProjectId: string | null, path: string) {
  if (docProjectId !== scope.projectId) redirect(`${financeBase(docProjectId)}${path}`);
}
