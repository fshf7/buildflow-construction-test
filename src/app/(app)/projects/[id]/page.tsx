import { Warehouse } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Separator } from "@/components/ui/separator";
import { ProjectForm } from "@/features/projects/components/project-form";
import { StructureEditor } from "@/features/projects/components/structure-editor";
import { getProject } from "@/features/projects/queries";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Объект" };

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const org = await requirePermission("projects.view");
  const { id } = await params;
  // Чужой или не назначенный объект RLS не вернёт — для пользователя его «нет» (US-09).
  const project = await getProject(org.id, id);
  if (!project) notFound();
  const canEdit = hasPermission(org, "projects.manage");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={`${project.code} — ${project.name}`}
        description={
          <span className="inline-flex items-center gap-1">
            <Warehouse className="size-4" aria-hidden />
            {project.warehouseName ?? "Склад не найден"}
          </span>
        }
      />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Реквизиты</h2>
        <ProjectForm project={project} canEdit={canEdit} />
      </section>
      <Separator />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Блоки и этажи</h2>
        <StructureEditor project={project} canEdit={canEdit} />
      </section>
    </div>
  );
}
