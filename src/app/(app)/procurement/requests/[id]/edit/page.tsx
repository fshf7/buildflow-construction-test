import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { RequestEditor } from "@/features/procurement/components/request-editor";
import { getRequest } from "@/features/procurement/queries";
import { listMaterialOptions, listProjectOptions } from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Черновик заявки" };

export default async function EditRequestPage({
  params,
}: PageProps<"/procurement/requests/[id]/edit">) {
  const org = await requirePermission("purchase_requests.manage");
  const { id } = await params;
  const request = await getRequest(org.id, id);
  if (!request) notFound();
  if (request.status !== "DRAFT") redirect(`/procurement/requests/${id}`);

  const [projects, materials] = await Promise.all([
    listProjectOptions(org.id),
    listMaterialOptions(org.id),
  ]);
  const num = (v: number) => String(v).replace(".", ",");

  return (
    <>
      <PageHeader title="Черновик заявки" description={request.projectLabel} />
      <RequestEditor
        projects={projects}
        materials={materials}
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
