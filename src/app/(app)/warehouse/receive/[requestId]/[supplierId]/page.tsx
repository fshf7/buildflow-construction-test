import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ReceiveForm } from "@/features/warehouse/components/receive-form";
import { receiveFormData } from "@/features/warehouse/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Приёмка" };

// Шаг 2–3 из 3: количества уже подставлены — проверить и «Провести».
export default async function ReceiveFromRequestPage({
  params,
}: PageProps<"/warehouse/receive/[requestId]/[supplierId]">) {
  await requirePermission("goods_receipts.post");
  const { requestId, supplierId } = await params;
  const data = await receiveFormData(requestId, supplierId);
  if (!data || data.lines.length === 0) notFound();

  return (
    <>
      <PageHeader
        title={data.supplierName}
        description={`Заявка ${data.requestNumber}. Укажите, сколько фактически приняли.`}
      />
      <ReceiveForm
        projectId={data.projectId}
        request={{ requestId, supplierId, lines: data.lines }}
      />
    </>
  );
}
