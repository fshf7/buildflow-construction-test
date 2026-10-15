import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { listSupplierOptions } from "@/features/shared/lookups";
import { ReceiveForm } from "@/features/warehouse/components/receive-form";
import { receiveFormData } from "@/features/warehouse/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Приёмка" };

// Шаг 2–3 из 3: поставщик по документам машины, количества уже подставлены — проверить и «Провести».
export default async function ReceiveFromRequestPage({
  params,
}: PageProps<"/warehouse/receive/[requestId]">) {
  const org = await requirePermission("goods_receipts.post");
  const { requestId } = await params;
  const [data, suppliers] = await Promise.all([
    receiveFormData(requestId),
    listSupplierOptions(org.id),
  ]);
  if (!data || data.lines.length === 0) notFound();

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
