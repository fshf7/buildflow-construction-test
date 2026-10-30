import "server-only";

import { pageCount, pageRange } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

import { changedFields, eventDetails, recordTitle } from "./labels";

export type AuditRow = {
  id: number;
  occurredAt: string;
  actorName: string;
  tableName: string;
  action: string;
  title: string | null;
  changed: string[];
  details: string | null;
};

type Json = Record<string, unknown> | null;

/**
 * Журнал по страницам, новые сверху (Д-108): записей много и они растут — БД отдаёт только
 * страницу (30 строк) и общее число. RLS: только с правом audit.view (§5.4 — в снимках цены).
 */
export async function listAudit(
  orgId: string,
  page: number,
): Promise<{ rows: AuditRow[]; total: number; page: number }> {
  const supabase = await createClient();
  const [counted, { data: members }] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase.from("organization_members").select("user_id, full_name").eq("organization_id", orgId),
  ]);
  if (counted.error) throw new Error(counted.error.message);
  const total = counted.count ?? 0;
  // Номер больше числа страниц (журнал короче, чем в ссылке) — последняя страница: запрос за
  // пределами журнала PostgREST отклоняет.
  const current = Math.min(page, pageCount(total));
  const { from, to } = pageRange(current);
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, occurred_at, actor_id, table_name, action, old_data, new_data")
    .eq("organization_id", orgId)
    .order("id", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);

  const names = new Map((members ?? []).map((m) => [m.user_id, m.full_name]));
  const rows = data.map((r): AuditRow => {
    const oldData = r.old_data as Json;
    const newData = r.new_data as Json;
    return {
      id: r.id,
      occurredAt: r.occurred_at,
      actorName: r.actor_id ? (names.get(r.actor_id) ?? "Пользователь вне организации") : "Система",
      tableName: r.table_name,
      action: r.action,
      title: recordTitle(newData ?? oldData),
      changed: r.action === "UPDATE" ? changedFields(oldData, newData) : [],
      details: eventDetails(r.action, newData),
    };
  });
  return { rows, total, page: current };
}
