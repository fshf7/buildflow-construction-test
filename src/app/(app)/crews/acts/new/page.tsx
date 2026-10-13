import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listRates } from "@/features/crews/queries";
import { listBlockOptions, listCrewOptions } from "@/features/shared/lookups";
import { ProjectPicker } from "@/features/warehouse/components/project-picker";
import { resolveProject } from "@/features/warehouse/context";
import { ActForm } from "@/features/work-acts/components/act-form";
import { requirePermission } from "@/lib/auth/access";
import { businessToday } from "@/lib/format";

export const metadata: Metadata = { title: "Новый акт" };

export default async function NewWorkActPage({ searchParams }: PageProps<"/crews/acts/new">) {
  const org = await requirePermission("work_acts.create");
  const { project: requested } = await searchParams;
  const { projects, project } = await resolveProject(org.id, requested);
  if (!project) return <p className="text-muted-foreground">Нет назначенных объектов.</p>;
  const [crews, rates, blocks] = await Promise.all([
    listCrewOptions(org.id),
    listRates(org.id),
    listBlockOptions(project.id),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <PageHeader title="Новый акт работ" description={project.label} />
      <ProjectPicker projects={projects} current={project.id} />
      <ActForm
        key={project.id}
        projectId={project.id}
        crews={crews}
        rates={rates}
        blocks={blocks}
        today={businessToday()}
      />
    </div>
  );
}
