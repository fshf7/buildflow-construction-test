import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { WorkActStatus } from "./labels";

export type WorkActRow = {
  id: string;
  number: string | null;
  docDate: string;
  projectLabel: string;
  crewName: string;
  status: WorkActStatus;
  total: number;
  currency: string;
  createdBy: string | null;
};

export type WorkActsFilter = {
  status?: WorkActStatus;
  project?: string;
  crew?: string;
  mine?: string;
};

/** Акты, видимые пользователю: RLS — свои объекты; кассир — только утверждённые (Д-71). */
export async function listWorkActs(
  orgId: string,
  f: WorkActsFilter,
  userId?: string,
): Promise<WorkActRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("work_completion_acts")
    .select(
      "id, number, doc_date, status, total_amount, currency, created_by, projects(code, name), crews(name)",
    )
    .eq("organization_id", orgId)
    .order("doc_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (f.status) q = q.eq("status", f.status);
  if (f.project) q = q.eq("project_id", f.project);
  if (f.crew) q = q.eq("crew_id", f.crew);
  if (f.mine && userId) q = q.eq("created_by", userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map((a) => ({
    id: a.id,
    number: a.number,
    docDate: a.doc_date,
    projectLabel: a.projects ? `${a.projects.code} — ${a.projects.name}` : "",
    crewName: a.crews?.name ?? "",
    status: a.status,
    total: Number(a.total_amount),
    currency: a.currency,
    createdBy: a.created_by,
  }));
}

export async function getWorkAct(id: string) {
  const supabase = await createClient();
  const { data: a, error } = await supabase
    .from("work_completion_acts")
    .select(
      "id, organization_id, project_id, crew_id, number, doc_date, period_from, period_to, status, currency, total_amount, replaces_act_id, note, status_comment, reject_reason, cancel_reason, created_by, created_at, posted_at, approved_at, rejected_at, cancelled_at, projects(code, name), crews(name), work_completion_items(id, line_no, work_type, block_id, floor_id, quantity, rate, amount, note, units_of_measure(code), blocks(name), floors(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!a) return null;
  const [{ data: payable }, { data: replacedBy }, { data: author }] = await Promise.all([
    supabase
      .from("payables")
      .select("id, amount, paid_amount, status")
      .eq("source_doc_type", "WORK_ACT")
      .eq("source_doc_id", id)
      .maybeSingle(),
    supabase.from("work_completion_acts").select("id, number").eq("replaces_act_id", id),
    a.created_by
      ? supabase
          .from("organization_members")
          .select("full_name")
          .eq("organization_id", a.organization_id)
          .eq("user_id", a.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const replaces = a.replaces_act_id
    ? (
        await supabase
          .from("work_completion_acts")
          .select("id, number")
          .eq("id", a.replaces_act_id)
          .maybeSingle()
      ).data
    : null;
  return {
    id: a.id,
    projectId: a.project_id,
    crewId: a.crew_id,
    number: a.number,
    docDate: a.doc_date,
    periodFrom: a.period_from,
    periodTo: a.period_to,
    status: a.status,
    currency: a.currency,
    total: Number(a.total_amount),
    note: a.note,
    rejectReason: a.reject_reason,
    cancelReason: a.cancel_reason,
    createdBy: a.created_by,
    authorName: author?.full_name ?? null,
    postedAt: a.posted_at,
    approvedAt: a.approved_at,
    rejectedAt: a.rejected_at,
    cancelledAt: a.cancelled_at,
    projectLabel: a.projects ? `${a.projects.code} — ${a.projects.name}` : "",
    crewName: a.crews?.name ?? "",
    lines: a.work_completion_items
      .sort((x, y) => x.line_no - y.line_no)
      .map((l) => ({
        id: l.id,
        workType: l.work_type,
        blockId: l.block_id,
        floorId: l.floor_id,
        place: [l.blocks?.name, l.floors?.name ? `этаж ${l.floors.name}` : null]
          .filter(Boolean)
          .join(", "),
        quantity: Number(l.quantity),
        unit: l.units_of_measure?.code ?? "",
        rate: Number(l.rate),
        amount: Number(l.amount),
        note: l.note,
      })),
    // Кассир видит обязательство; прораб — нет (payables.view), тогда оплаты не показываем.
    payable: payable
      ? {
          id: payable.id,
          paid: Number(payable.paid_amount),
          remaining: Number(payable.amount) - Number(payable.paid_amount),
          status: payable.status,
        }
      : null,
    replaces,
    replacedBy: replacedBy ?? [],
  };
}

export type DuplicateRow = {
  actId: string;
  number: string | null;
  status: WorkActStatus;
  docDate: string;
  workType: string;
  place: string;
  quantity: number;
};

/** Д-73: возможные дубли — предупреждение, не запрет. */
export async function workActDuplicates(id: string): Promise<DuplicateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("work_act_duplicates", { p_id: id });
  if (error) return [];
  return data.map((d) => ({
    actId: d.act_id,
    number: d.number,
    status: d.status,
    docDate: d.doc_date,
    workType: d.work_type,
    place: [d.block_name, d.floor_name ? `этаж ${d.floor_name}` : null].filter(Boolean).join(", "),
    quantity: Number(d.quantity),
  }));
}
