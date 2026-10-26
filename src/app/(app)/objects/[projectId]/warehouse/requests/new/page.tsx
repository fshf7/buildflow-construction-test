import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { RequestEditor } from "@/features/procurement/components/request-editor";
import { requireObject } from "@/features/projects/object";
import { listMaterialOptions } from "@/features/shared/lookups";
import { draftStorageKey } from "@/lib/form-draft-store";

export const metadata: Metadata = { title: "Новая заявка" };

export default async function NewRequestPage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/requests/new">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "purchase_requests.manage");
  const materials = await listMaterialOptions(org.id);
  return (
    <>
      <PageHeader
        title="Новая заявка"
        description="Что и сколько нужно объекту. Поставщика и цену указывать не нужно — их внесёт бухгалтер из накладной."
      />
      <RequestEditor
        materials={materials}
        draftKey={draftStorageKey(org.member_id, `request.new.${project.id}`)}
      />
    </>
  );
}
