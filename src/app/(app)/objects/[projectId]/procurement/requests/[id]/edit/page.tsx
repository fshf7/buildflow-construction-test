import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { RequestEditor } from "@/features/procurement/components/request-editor";
import { getRequest } from "@/features/procurement/queries";
import { ensureDocInObject, requireObject } from "@/features/projects/object";
import { listMaterialOptions } from "@/features/shared/lookups";
import { draftStorageKey } from "@/lib/form-draft-store";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Черновик заявки" };

export default async function EditRequestPage({
  params,
}: PageProps<"/objects/[projectId]/procurement/requests/[id]/edit">) {
  const { projectId, id } = await params;
  const { org, project } = await requireObject(projectId, "purchase_requests.manage");
  const request = await getRequest(org.id, id);
  if (!request) notFound();
  ensureDocInObject(project.id, request.projectId, `/procurement/requests/${id}/edit`);
  if (request.status !== "DRAFT") redirect(objectHref(project.id, `/procurement/requests/${id}`));

  const materials = await listMaterialOptions(org.id);
  const num = (v: number) => String(v).replace(".", ",");

  return (
    <>
      <PageHeader title="Черновик заявки" />
      <RequestEditor
        materials={materials}
        draftKey={draftStorageKey(org.member_id, `request.${id}`)}
        initial={{
          id: request.id,
          projectId: request.projectId,
          neededBy: request.neededBy ?? "",
          currency: "TJS",
          note: request.note ?? "",
          lines: request.lines.map((l) => ({
            materialId: l.materialId,
            quantity: num(l.quantity),
            note: l.note ?? "",
          })),
        }}
      />
    </>
  );
}
