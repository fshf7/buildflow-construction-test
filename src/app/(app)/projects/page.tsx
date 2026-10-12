import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ProjectsTable } from "@/features/projects/components/projects-table";
import { listProjects } from "@/features/projects/queries";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Объекты" };

export default async function ProjectsPage() {
  const org = await requirePermission("projects.view");
  const projects = await listProjects(org.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Объекты"
        description="Стройки организации, доступные вам. У каждого объекта — свой склад."
        actions={
          hasPermission(org, "projects.manage") ? (
            <Link href="/projects/new" className={buttonVariants()}>
              Новый объект
            </Link>
          ) : null
        }
      />
      <ProjectsTable projects={projects} />
    </div>
  );
}
