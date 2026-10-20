import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { InvoiceEditor } from "@/features/procurement/components/invoice-editor";
import { getInvoice, listRequestOptions } from "@/features/procurement/queries";
import { ensureDocInObject, requireObject } from "@/features/projects/object";
import {
  listMaterialOptions,
  listSupplierOptions,
  listUnitOptions,
} from "@/features/shared/lookups";
import { draftStorageKey } from "@/lib/form-draft-store";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Накладная" };

const num = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

export default async function EditInvoicePage({
  params,
}: PageProps<"/objects/[projectId]/procurement/invoices/[id]/edit">) {
  const { projectId, id } = await params;
  const { org, project } = await requireObject(projectId, "supplier_invoices.manage");
  const invoice = await getInvoice(org.id, id, true);
  if (!invoice) notFound();
  ensureDocInObject(project.id, invoice.projectId, `/procurement/invoices/${id}/edit`);
  if (invoice.status !== "ENTERED") redirect(objectHref(project.id, `/procurement/invoices/${id}`));

  const [suppliers, materials, units, requests] = await Promise.all([
    listSupplierOptions(org.id),
    listMaterialOptions(org.id),
    listUnitOptions(org.id),
    listRequestOptions(org.id, project.id),
  ]);

  return (
    <>
      <PageHeader
        title="Накладная"
        description={`${invoice.supplierName} · № ${invoice.supplierDocNumber}`}
      />
      <InvoiceEditor
        suppliers={suppliers}
        materials={materials}
        units={units}
        requests={requests}
        draftKey={draftStorageKey(org.member_id, `invoice.${id}`)}
        initial={{
          id: invoice.id,
          projectId: invoice.projectId,
          supplierId: invoice.supplierId,
          purchaseRequestId: invoice.purchaseRequestId ?? "",
          supplierDocNumber: invoice.supplierDocNumber,
          supplierDocDate: invoice.supplierDocDate,
          currency: invoice.currency,
          note: invoice.note ?? "",
          lines: invoice.lines.map((l) => ({
            materialId: l.materialId ?? "",
            description: l.description ?? "",
            unitId: l.unitId,
            quantity: num(l.quantity),
            price: num(l.price),
            purchaseRequestItemId: l.purchaseRequestItemId ?? "",
          })),
        }}
      />
    </>
  );
}
