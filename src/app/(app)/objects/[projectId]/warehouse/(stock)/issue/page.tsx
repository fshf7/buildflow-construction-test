import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requireObject } from "@/features/projects/object";
import { listBlockOptions, listCrewOptions } from "@/features/shared/lookups";
import { IssueForm } from "@/features/warehouse/components/issue-form";
import { listBalances } from "@/features/warehouse/queries";

export const metadata: Metadata = { title: "Выдача" };

export default async function IssuePage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/issue">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "material_issues.post");
  const [crews, blocks, balances] = await Promise.all([
    listCrewOptions(org.id),
    listBlockOptions(project.id),
    listBalances(project.id),
  ]);

  return (
    <>
      <PageHeader title="Выдача бригаде" description={project.label} />
      <IssueForm projectId={project.id} crews={crews} blocks={blocks} balances={balances} />
    </>
  );
}
