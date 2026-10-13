import "server-only";

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

/** Последние записи журнала. RLS: только с правом audit.view (§5.4 — в снимках будут цены). */
export async function listAudit(orgId: string, limit = 100): Promise<AuditRow[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: members }] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("id, occurred_at, actor_id, table_name, action, old_data, new_data")
      .eq("organization_id", orgId)
      .order("id", { ascending: false })
      .limit(limit),
    supabase.from("organization_members").select("user_id, full_name").eq("organization_id", orgId),
  ]);
  if (error) throw new Error(error.message);

  const names = new Map((members ?? []).map((m) => [m.user_id, m.full_name]));
  return data.map((r) => {
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
}
