import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listBlockOptions } from "@/features/shared/lookups";
import { TaskForm } from "@/features/tasks/components/task-form";
import { listTaskAssignees } from "@/features/tasks/queries";
import { ProjectPicker } from "@/features/warehouse/components/project-picker";
import { resolveProject } from "@/features/warehouse/context";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Новая задача" };

export default async function NewTaskPage({ searchParams }: PageProps<"/tasks/new">) {
  const org = await requirePermission("tasks.manage");
  const { project: requested } = await searchParams;
  const { projects, project } = await resolveProject(org.id, requested);
  if (!project) return <p className="text-muted-foreground">Нет закреплённых объектов.</p>;
  const [assignees, blocks] = await Promise.all([
    listTaskAssignees(project.id),
    listBlockOptions(project.id),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <PageHeader title="Новая задача" description={project.label} />
      <ProjectPicker projects={projects} current={project.id} />
      <TaskForm key={project.id} projectId={project.id} assignees={assignees} blocks={blocks} />
    </div>
  );
}
