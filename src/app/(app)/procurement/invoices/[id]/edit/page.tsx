import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { InvoiceEditor } from "@/features/procurement/components/invoice-editor";
import { getInvoice, listRequestOptions } from "@/features/procurement/queries";
import {
  listMaterialOptions,
  listProjectOptions,
  listSupplierOptions,
  listUnitOptions,
} from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";
import { draftStorageKey } from "@/lib/form-draft-store";

export const metadata: Metadata = { title: "Накладная" };

const num = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

export default async function EditInvoicePage({
  params,
}: PageProps<"/procurement/invoices/[id]/edit">) {
  const org = await requirePermission("supplier_invoices.manage");
  const { id } = await params;
  const invoice = await getInvoice(org.id, id, true);
  if (!invoice) notFound();
  if (invoice.status !== "ENTERED") redirect(`/procurement/invoices/${id}`);

  const [projects, suppliers, materials, units, requests] = await Promise.all([
    listProjectOptions(org.id),
    listSupplierOptions(org.id),
    listMaterialOptions(org.id),
    listUnitOptions(org.id),
    listRequestOptions(org.id),
  ]);

  return (
    <>
      <PageHeader
        title="Накладная"
        description={`${invoice.supplierName} · № ${invoice.supplierDocNumber}`}
      />
      <InvoiceEditor
        projects={projects}
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
