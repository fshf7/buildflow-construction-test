import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ensureDocInObject, requireObject } from "@/features/projects/object";
import { listSupplierOptions } from "@/features/shared/lookups";
import { ReceiveForm } from "@/features/warehouse/components/receive-form";
import { receiveFormData } from "@/features/warehouse/queries";

export const metadata: Metadata = { title: "Приёмка" };

// Шаг 2–3 из 3: поставщик по документам машины, количества уже подставлены — проверить и «Провести».
export default async function ReceiveFromRequestPage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/receive/[requestId]">) {
  const { projectId, requestId } = await params;
  const { org, project } = await requireObject(projectId, "goods_receipts.post");
  const [data, suppliers] = await Promise.all([
    receiveFormData(requestId),
    listSupplierOptions(org.id),
  ]);
  if (!data || data.lines.length === 0) notFound();
  ensureDocInObject(project.id, data.projectId, `/warehouse/receive/${requestId}`);

  return (
    <>
      <PageHeader
        title={`Заявка ${data.requestNumber}`}
        description="Выберите поставщика по документам машины и укажите, сколько фактически приняли. Чего не привезли — оставьте пустым."
      />
      <ReceiveForm
        projectId={data.projectId}
        suppliers={suppliers}
        request={{ requestId, lines: data.lines }}
      />
    </>
  );
}
