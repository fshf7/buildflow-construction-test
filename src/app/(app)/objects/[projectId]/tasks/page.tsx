import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PagedPager, PageSlice } from "@/components/pagination";
import { requireObject } from "@/features/projects/object";
import { TASK_STATUS_LABELS, isOverdue, type TaskStatus } from "@/features/tasks/labels";
import { listTasks } from "@/features/tasks/queries";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { businessToday, formatDate } from "@/lib/format";
import { objectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Задачи" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

// BP-06: исполнитель видит свои задачи, управляющий — задачи своих объектов, бухгалтер — все (Д-74);
// внутри объекта — только задачи этого объекта (Д-94).
export default async function TasksPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/tasks">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  if (!hasAnyPermission(org, ["tasks.view", "tasks.execute", "tasks.manage"]))
    redirect("/no-access?reason=forbidden");
  const sp = await searchParams;
  const status = one(sp.status) as TaskStatus | undefined;
  const validStatus = status && status in TASK_STATUS_LABELS ? status : undefined;
  const rows = await listTasks(org.id, {
    status: validStatus,
    project: project.id,
    open: !validStatus && one(sp.all) !== "1",
  });
  const today = businessToday();
  const overdue = rows.filter((t) => isOverdue(t.dueDate, t.status, today)).length;
  const executorOnly = !hasAnyPermission(org, ["tasks.view", "tasks.manage"]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        title={executorOnly ? "Мои задачи" : "Задачи"}
        description={overdue > 0 ? `Просрочено: ${overdue}` : undefined}
        actions={
          hasPermission(org, "tasks.manage") ? (
            <Link href={objectHref(project.id, "/tasks/new")} className={buttonVariants()}>
              Новая задача
            </Link>
          ) : null
        }
      />
      <FiltersBar
        fields={[
          {
            name: "status",
            label: "Статус (по умолчанию — открытые)",
            type: "select",
            options: Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
      />
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Задач нет.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            <PageSlice>
              {rows.map((t) => {
                const late = isOverdue(t.dueDate, t.status, today);
                return (
                  <li key={t.id}>
                    <Link
                      href={objectHref(project.id, `/tasks/${t.id}`)}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-xl border p-4 hover:bg-muted/50",
                        late && "border-destructive/60 bg-destructive/5",
                      )}
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-base font-semibold">{t.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.number}
                          {executorOnly ? "" : ` · ${t.assigneeName}`}
                        </span>
                        {t.dueDate ? (
                          <span className={cn("text-sm", late && "font-semibold text-destructive")}>
                            {late ? "Просрочена! Срок " : "Срок "}
                            {formatDate(t.dueDate)}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <Badge variant={t.status === "BLOCKED" ? "destructive" : "outline"}>
                          {TASK_STATUS_LABELS[t.status]}
                        </Badge>
                        {t.priority === "HIGH" ? <Badge variant="secondary">Срочно</Badge> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </PageSlice>
          </ul>
          <PagedPager total={rows.length} />
        </>
      )}
    </div>
  );
}
