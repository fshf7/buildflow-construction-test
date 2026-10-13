import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { TaskActions } from "@/features/tasks/components/task-actions";
import { TaskComments } from "@/features/tasks/components/task-comments";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, isOverdue } from "@/features/tasks/labels";
import { getTask } from "@/features/tasks/queries";
import { requireOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { businessToday, formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Задача" };

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const org = await requireOrg();
  const { id } = await params;
  const task = await getTask(id);
  if (!task) notFound();
  const executor = task.assigneeMemberId === org.member_id && hasPermission(org, "tasks.execute");
  const manager = hasPermission(org, "tasks.manage");
  const late = isOverdue(task.dueDate, task.status, businessToday());
  const open = task.status !== "DONE" && task.status !== "CANCELLED";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader title={task.title} description={`${task.number} · ${task.projectLabel}`} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={task.status === "BLOCKED" ? "destructive" : "outline"}>
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
        {task.priority !== "NORMAL" ? (
          <Badge variant="secondary">{TASK_PRIORITY_LABELS[task.priority]} приоритет</Badge>
        ) : null}
        {late ? <Badge variant="destructive">Просрочена</Badge> : null}
      </div>
      {task.status === "BLOCKED" && task.blockedReason ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <b>Причина блокировки:</b> {task.blockedReason}
        </p>
      ) : null}
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Исполнитель</dt>
        <dd>{task.assigneeName}</dd>
        <dt className="text-muted-foreground">Срок</dt>
        <dd className={late ? "font-semibold text-destructive" : undefined}>
          {formatDate(task.dueDate)}
        </dd>
        {task.place ? (
          <>
            <dt className="text-muted-foreground">Где</dt>
            <dd>{task.place}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Поставил</dt>
        <dd>
          {task.authorName ?? "—"}, {formatDateTime(task.createdAt)}
        </dd>
        {task.completedAt ? (
          <>
            <dt className="text-muted-foreground">Выполнена</dt>
            <dd>{formatDateTime(task.completedAt)}</dd>
          </>
        ) : null}
      </dl>
      {task.description ? <p className="text-sm whitespace-pre-wrap">{task.description}</p> : null}

      <TaskActions id={task.id} status={task.status} executor={executor} manager={manager} />

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Фото и файлы</h2>
        <Attachments
          docType="TASK"
          docId={task.id}
          files={task.attachments}
          canUpload={open && (executor || manager)}
          revalidate={`/tasks/${task.id}`}
          label="Добавить фото"
        />
      </section>
      <TaskComments taskId={task.id} comments={task.comments} canComment={open} />
    </div>
  );
}
