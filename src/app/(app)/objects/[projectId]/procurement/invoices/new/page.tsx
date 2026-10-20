import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { InvoiceEditor } from "@/features/procurement/components/invoice-editor";
import { listRequestOptions, requestLinesForInvoice } from "@/features/procurement/queries";
import { requireObject } from "@/features/projects/object";
import {
  listMaterialOptions,
  listSupplierOptions,
  listUnitOptions,
} from "@/features/shared/lookups";
import { draftStorageKey } from "@/lib/form-draft-store";

export const metadata: Metadata = { title: "Новая накладная" };

const num = (v: number) => String(v).replace(".", ",");

export default async function NewInvoicePage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/procurement/invoices/new">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "supplier_invoices.manage");
  const { request, supplier } = await searchParams;
  const requestId = typeof request === "string" ? request : undefined;
  const supplierId = typeof supplier === "string" ? supplier : undefined;

  const [suppliers, materials, units, requests] = await Promise.all([
    listSupplierOptions(org.id),
    listMaterialOptions(org.id),
    listUnitOptions(org.id),
    listRequestOptions(org.id, project.id),
  ]);

  // Из заявки этого объекта: если указан поставщик — строки из того, что склад принял от него
  // по этой заявке. Цены в заявке нет (Д-92) — бухгалтер вносит её из бумажной накладной.
  let initial = {};
  if (requestId && requests.some((r) => r.id === requestId)) {
    const lines = supplierId ? await requestLinesForInvoice(requestId, supplierId) : [];
    initial = {
      purchaseRequestId: requestId,
      ...(supplierId ? { supplierId } : {}),
      ...(lines.length > 0
        ? {
            lines: lines.map((l) => ({
              materialId: l.materialId,
              description: "",
              unitId: l.unitId,
              quantity: num(l.quantity),
              price: "",
              purchaseRequestItemId: l.purchaseRequestItemId ?? "",
            })),
          }
        : {}),
    };
  }

  // Переход «из заявки» (и от конкретного поставщика) — свой ввод, не подменяется пустой формой.
  const draftScope = ["invoice.new", project.id, requestId, supplierId].filter(Boolean).join(".");

  return (
    <>
      <PageHeader
        title="Новая накладная"
        description="Введите данные бумажной накладной поставщика. Номер НК присвоится при отправке на проверку."
      />
      <InvoiceEditor
        initial={initial}
        suppliers={suppliers}
        materials={materials}
        units={units}
        requests={requests}
        draftKey={draftStorageKey(org.member_id, draftScope)}
      />
    </>
  );
}
