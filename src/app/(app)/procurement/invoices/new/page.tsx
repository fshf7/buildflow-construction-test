import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { InvoiceEditor } from "@/features/procurement/components/invoice-editor";
import { listRequestOptions, requestLinesForInvoice } from "@/features/procurement/queries";
import {
  listMaterialOptions,
  listProjectOptions,
  listSupplierOptions,
  listUnitOptions,
} from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Новая накладная" };

const num = (v: number) => String(v).replace(".", ",");

export default async function NewInvoicePage({
  searchParams,
}: PageProps<"/procurement/invoices/new">) {
  const org = await requirePermission("supplier_invoices.manage");
  const { request, supplier } = await searchParams;
  const requestId = typeof request === "string" ? request : undefined;
  const supplierId = typeof supplier === "string" ? supplier : undefined;

  const [projects, suppliers, materials, units, requests] = await Promise.all([
    listProjectOptions(org.id),
    listSupplierOptions(org.id),
    listMaterialOptions(org.id),
    listUnitOptions(org.id),
    listRequestOptions(org.id),
  ]);

  // Из заявки: строки этого поставщика с ценами заявки и принятым количеством.
  let initial = {};
  if (requestId && supplierId) {
    const supabase = await createClient();
    const { data: req } = await supabase
      .from("purchase_requests")
      .select("project_id, currency")
      .eq("id", requestId)
      .maybeSingle();
    const lines = await requestLinesForInvoice(requestId, supplierId);
    initial = {
      projectId: req?.project_id,
      supplierId,
      purchaseRequestId: requestId,
      currency: req?.currency ?? "TJS",
      lines: lines.map((l) => ({
        materialId: l.materialId,
        description: "",
        unitId: l.unitId,
        quantity: num(l.quantity),
        price: num(Number(l.price ?? 0)),
        purchaseRequestItemId: l.purchaseRequestItemId,
      })),
    };
  }

  return (
    <>
      <PageHeader
        title="Новая накладная"
        description="Введите данные бумажной накладной поставщика. Номер НК присвоится при отправке на проверку."
      />
      <InvoiceEditor
        initial={initial}
        projects={projects}
        suppliers={suppliers}
        materials={materials}
        units={units}
        requests={requests}
      />
    </>
  );
}
