import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listExpenseCategories } from "@/features/catalog/queries";
import { InvoiceSheet } from "@/features/procurement/components/invoice-sheet";
import { requireObject } from "@/features/projects/object";
import {
  listMaterialOptions,
  listSupplierOptions,
  listUnitOptions,
} from "@/features/shared/lookups";
import { draftStorageKey } from "@/lib/form-draft-store";
import { businessToday } from "@/lib/format";

export const metadata: Metadata = { title: "Новая накладная" };

/** Новая накладная (Д-99): заполняется как таблица Excel, сохраняется целиком. */
export default async function NewInvoicePage({
  params,
}: PageProps<"/objects/[projectId]/procurement/invoices/new">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "supplier_invoices.manage");
  const [categories, suppliers, units, materials] = await Promise.all([
    listExpenseCategories(org.id, true),
    listSupplierOptions(org.id),
    listUnitOptions(org.id),
    listMaterialOptions(org.id),
  ]);
  return (
    <>
      <PageHeader
        title="Новая накладная"
        description="Поставщик и дата — в шапке, строки — как в Excel. Номер присвоится при сохранении."
      />
      <InvoiceSheet
        suppliers={suppliers}
        categories={categories}
        units={units}
        materials={materials}
        draftKey={draftStorageKey(org.member_id, `invoice.new.${project.id}`)}
        today={businessToday()}
      />
    </>
  );
}
