import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listWorkStages } from "@/features/catalog/queries";
import { requireObject } from "@/features/projects/object";
import { listBlockOptions, listResponsibleOptions } from "@/features/shared/lookups";
import { IssueForm } from "@/features/warehouse/components/issue-form";
import { listBalances } from "@/features/warehouse/queries";

export const metadata: Metadata = { title: "Выдача" };

export default async function IssuePage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/issue">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "material_issues.post");
  // Бригада подписана бригадиром, как в «Расходе» (Д-100).
  const [crews, blocks, stages, balances] = await Promise.all([
    listResponsibleOptions(org.id),
    listBlockOptions(project.id),
    listWorkStages(org.id, true),
    listBalances(project.id),
  ]);

  return (
    <>
      <PageHeader title="Выдача бригаде" description={project.label} />
      <IssueForm
        projectId={project.id}
        crews={crews}
        blocks={blocks}
        stages={stages.map((s) => ({ id: s.id, label: s.name }))}
        balances={balances}
      />
    </>
  );
}
