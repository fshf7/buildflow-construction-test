import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requireObject } from "@/features/projects/object";
import { listMaterialOptions } from "@/features/shared/lookups";
import { ReceiveForm } from "@/features/warehouse/components/receive-form";

export const metadata: Metadata = { title: "Приёмка без заявки" };

export default async function FreeReceivePage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/receive/free">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "goods_receipts.post");
  const materials = await listMaterialOptions(org.id);

  return (
    <>
      <PageHeader title="Приёмка без заявки" description={project.label} />
      <ReceiveForm projectId={project.id} materials={materials} />
    </>
  );
}
