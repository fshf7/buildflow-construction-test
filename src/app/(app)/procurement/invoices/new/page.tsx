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
import { draftStorageKey } from "@/lib/form-draft-store";
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

  // Из заявки: объект и заявка; если указан поставщик — строки из того, что склад принял от него
  // по этой заявке. Цены в заявке нет (Д-92) — бухгалтер вносит её из бумажной накладной.
  let initial = {};
  if (requestId) {
    const supabase = await createClient();
    const { data: req } = await supabase
      .from("purchase_requests")
      .select("project_id")
      .eq("id", requestId)
      .maybeSingle();
    const lines = supplierId ? await requestLinesForInvoice(requestId, supplierId) : [];
    initial = {
      projectId: req?.project_id,
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
  const draftScope = ["invoice.new", requestId, supplierId].filter(Boolean).join(".");

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
        draftKey={draftStorageKey(org.member_id, draftScope)}
      />
    </>
  );
}
