import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { listExpenseCategories, listServices } from "@/features/catalog/queries";
import { InvoiceSheet } from "@/features/procurement/components/invoice-sheet";
import { getInvoice, listInvoiceRequestOptions } from "@/features/procurement/queries";
import { ensureDocInObject, requireObject } from "@/features/projects/object";
import {
  listMaterialOptions,
  listSupplierOptions,
  listUnitOptions,
} from "@/features/shared/lookups";
import { draftStorageKey } from "@/lib/form-draft-store";
import { businessToday } from "@/lib/format";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Исправить накладную" };

const num = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

/** Исправление накладной (Д-99): только без оплат; номер сохраняется, долг пересчитывается. */
export default async function EditInvoicePage({
  params,
}: PageProps<"/objects/[projectId]/procurement/invoices/[id]/edit">) {
  const { projectId, id } = await params;
  const { org, project } = await requireObject(projectId, "supplier_invoices.manage");
  const invoice = await getInvoice(org.id, id, true);
  if (!invoice) notFound();
  ensureDocInObject(project.id, invoice.projectId, `/procurement/invoices/${id}/edit`);
  if (invoice.status === "CANCELLED" || (invoice.payable?.paid ?? 0) > 0) {
    redirect(objectHref(project.id, `/procurement/invoices/${id}`));
  }
  const [categories, suppliers, units, materials, requests, services] = await Promise.all([
    listExpenseCategories(org.id),
    listSupplierOptions(org.id),
    listUnitOptions(org.id),
    listMaterialOptions(org.id),
    listInvoiceRequestOptions(project.id, invoice.purchaseRequestId),
    listServices(org.id, true),
  ]);
  return (
    <>
      <PageHeader
        title={`Исправить накладную ${invoice.number ?? ""}`}
        description="Номер сохранится, долг поставщику пересчитается. Изменения попадут в журнал аудита."
      />
      <InvoiceSheet
        number={invoice.number}
        initial={{
          id: invoice.id,
          supplierId: invoice.supplierId,
          requestId: invoice.purchaseRequestId ?? "",
          docDate: invoice.docDate,
          docNumber: invoice.supplierDocNumber ?? "",
          currency: invoice.currency,
          note: invoice.note ?? "",
          lines: invoice.lines.map((l) => ({
            description: l.description ?? l.materialName ?? l.serviceName ?? "",
            materialId: l.materialId ?? "",
            serviceId: l.serviceId ?? "",
            categoryId: l.categoryId ?? "",
            quantity: num(l.quantity),
            unitId: l.unitId,
            price: num(l.price),
          })),
        }}
        suppliers={suppliers}
        requests={requests}
        categories={categories}
        units={units}
        materials={materials}
        services={services}
        draftKey={draftStorageKey(org.member_id, `invoice.${invoice.id}`)}
        today={businessToday()}
      />
    </>
  );
}
