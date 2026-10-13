import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { TaskPriority, TaskStatus } from "./labels";

export type TaskRow = {
  id: string;
  number: string | null;
  title: string;
  projectLabel: string;
  assigneeName: string;
  assigneeMemberId: string;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
};

export type TasksFilter = {
  status?: TaskStatus;
  project?: string;
  open?: boolean;
  assignee?: string;
};

/** Задачи, видимые пользователю (RLS, Д-74): исполнитель — свои, управляющий — своих объектов, бухгалтер — все. */
export async function listTasks(orgId: string, f: TasksFilter): Promise<TaskRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("tasks")
    .select(
      "id, number, title, due_date, priority, status, assignee_member_id, projects(code, name), organization_members(full_name)",
    )
    .eq("organization_id", orgId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (f.status) q = q.eq("status", f.status);
  else if (f.open) q = q.not("status", "in", "(DONE,CANCELLED)");
  if (f.project) q = q.eq("project_id", f.project);
  if (f.assignee) q = q.eq("assignee_member_id", f.assignee);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map((t) => ({
    id: t.id,
    number: t.number,
    title: t.title,
    projectLabel: t.projects ? `${t.projects.code} — ${t.projects.name}` : "",
    assigneeName: t.organization_members?.full_name ?? "",
    assigneeMemberId: t.assignee_member_id,
    dueDate: t.due_date,
    priority: t.priority,
    status: t.status,
  }));
}

export async function getTask(id: string) {
  const supabase = await createClient();
  const { data: t, error } = await supabase
    .from("tasks")
    .select(
      "id, organization_id, project_id, number, title, description, assignee_member_id, due_date, priority, status, blocked_reason, completed_at, created_at, created_by, block_id, floor_id, projects(code, name), organization_members(full_name), blocks(name), floors(name), task_comments(id, body, created_at, created_by)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) return null;
  const userIds = [
    ...new Set([t.created_by, ...t.task_comments.map((c) => c.created_by)].filter(Boolean)),
  ] as string[];
  const [{ data: people }, { data: files }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, full_name")
      .eq("organization_id", t.organization_id)
      .in("user_id", userIds),
    supabase
      .from("document_attachments")
      .select("id, file_name, storage_path")
      .eq("doc_type", "TASK")
      .eq("doc_id", id)
      .order("created_at"),
  ]);
  const name = new Map((people ?? []).map((p) => [p.user_id, p.full_name]));
  const attachments = await Promise.all(
    (files ?? []).map(async (a) => {
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(a.storage_path, 300);
      return { id: a.id, fileName: a.file_name, url: data?.signedUrl ?? null };
    }),
  );
  return {
    id: t.id,
    projectId: t.project_id,
    number: t.number,
    title: t.title,
    description: t.description,
    assigneeMemberId: t.assignee_member_id,
    assigneeName: t.organization_members?.full_name ?? "",
    dueDate: t.due_date,
    priority: t.priority,
    status: t.status,
    blockedReason: t.blocked_reason,
    completedAt: t.completed_at,
    createdAt: t.created_at,
    authorName: (t.created_by && name.get(t.created_by)) || null,
    blockId: t.block_id,
    floorId: t.floor_id,
    place: [t.blocks?.name, t.floors?.name ? `этаж ${t.floors.name}` : null]
      .filter(Boolean)
      .join(", "),
    projectLabel: t.projects ? `${t.projects.code} — ${t.projects.name}` : "",
    comments: t.task_comments
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.created_at,
        author: (c.created_by && name.get(c.created_by)) || "",
      })),
    attachments,
  };
}

/** Исполнители объекта: склад, кассир, прораб с доступом к объекту (для формы управляющего). */
export async function listTaskAssignees(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("task_assignees", { p_project_id: projectId });
  if (error) throw new Error(error.message);
  return data.map((m) => ({ id: m.member_id, label: `${m.full_name} (${m.roles.join(", ")})` }));
}
