import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ensureDocInObject, requireObject } from "@/features/projects/object";
import { ReturnForm } from "@/features/warehouse/components/return-form";
import { returnFormData } from "@/features/warehouse/queries";

export const metadata: Metadata = { title: "Возврат" };

export default async function ReturnFormPage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/return/[issueId]">) {
  const { projectId, issueId } = await params;
  const { project } = await requireObject(projectId, "material_issues.post");
  const data = await returnFormData(issueId);
  if (!data || data.status !== "POSTED") notFound();
  ensureDocInObject(project.id, data.projectId, `/warehouse/return/${issueId}`);

  return (
    <>
      <PageHeader title={`Возврат: ${data.crewName}`} description={`По выдаче ${data.number}`} />
      <ReturnForm issueId={data.id} lines={data.lines} />
    </>
  );
}
