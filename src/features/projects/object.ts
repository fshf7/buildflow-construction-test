import "server-only";

import { notFound, redirect } from "next/navigation";

import { requireOrg, requirePermission } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";
import { objectHref } from "@/lib/routes";

import { getProjectHeader } from "./queries";

/**
 * Страница «внутри объекта» (Д-94): организация, право (если нужно) и сам объект из адреса.
 * Объект не виден пользователю (RLS) или из другой организации — 404. Данные дополнительно
 * защищены RLS по project_id.
 */
export async function requireObject(projectId: string, permission?: Permission) {
  const org = permission ? await requirePermission(permission) : await requireOrg();
  const project = await getProjectHeader(org.id, projectId);
  if (!project) notFound();
  return { org, project };
}

/**
 * Документ другого объекта, открытый по адресу этого (ссылка из отчёта, «Общего», закладка) —
 * на его настоящий адрес: внутри объекта показываются только его документы.
 */
export function ensureDocInObject(projectId: string, docProjectId: string, path: string): void {
  if (docProjectId !== projectId) redirect(objectHref(docProjectId, path));
}
