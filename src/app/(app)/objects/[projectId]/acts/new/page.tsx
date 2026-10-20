import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listRates } from "@/features/crews/queries";
import { requireObject } from "@/features/projects/object";
import { listBlockOptions, listCrewOptions } from "@/features/shared/lookups";
import { ActForm } from "@/features/work-acts/components/act-form";
import { businessToday } from "@/lib/format";

export const metadata: Metadata = { title: "Новый акт" };

export default async function NewWorkActPage({
  params,
}: PageProps<"/objects/[projectId]/acts/new">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "work_acts.create");
  const [crews, rates, blocks] = await Promise.all([
    listCrewOptions(org.id),
    listRates(org.id),
    listBlockOptions(project.id),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <PageHeader title="Новый акт работ" description={project.label} />
      <ActForm
        projectId={project.id}
        crews={crews}
        rates={rates}
        blocks={blocks}
        today={businessToday()}
      />
    </div>
  );
}
