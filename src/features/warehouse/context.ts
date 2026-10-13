import "server-only";

import { listProjectOptions, type Option } from "@/features/shared/lookups";

/** Текущий объект склада: ?project=… (если доступен пользователю), иначе первый доступный. */
export async function resolveProject(
  orgId: string,
  requested: string | string[] | undefined,
): Promise<{ projects: Option[]; project: Option | null }> {
  const projects = await listProjectOptions(orgId);
  const id = typeof requested === "string" ? requested : undefined;
  return { projects, project: projects.find((p) => p.id === id) ?? projects[0] ?? null };
}
