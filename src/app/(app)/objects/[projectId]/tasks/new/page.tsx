import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requireObject } from "@/features/projects/object";
import { listBlockOptions } from "@/features/shared/lookups";
import { TaskForm } from "@/features/tasks/components/task-form";
import { listTaskAssignees } from "@/features/tasks/queries";

export const metadata: Metadata = { title: "Новая задача" };

export default async function NewTaskPage({ params }: PageProps<"/objects/[projectId]/tasks/new">) {
  const { projectId } = await params;
  const { project } = await requireObject(projectId, "tasks.manage");
  const [assignees, blocks] = await Promise.all([
    listTaskAssignees(project.id),
    listBlockOptions(project.id),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <PageHeader title="Новая задача" description={project.label} />
      <TaskForm projectId={project.id} assignees={assignees} blocks={blocks} />
    </div>
  );
}
