import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { ProjectForm } from "@/features/projects/components/project-form";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Новый объект" };

export default async function NewProjectPage() {
  await requirePermission("projects.manage");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Новый объект" description="Склад объекта создастся автоматически." />
      <ProjectForm />
    </div>
  );
}
