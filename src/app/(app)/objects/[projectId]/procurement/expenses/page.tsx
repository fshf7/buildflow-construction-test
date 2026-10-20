import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listExpenseCategories } from "@/features/catalog/queries";
import { ExpensesTable } from "@/features/procurement/components/expenses-table";
import { listExpenseRows } from "@/features/procurement/queries";
import { requireObject } from "@/features/projects/object";
import { listSupplierOptions } from "@/features/shared/lookups";
import { hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Затраты" };

/** Затраты объекта (Д-99) — строки всех накладных, только просмотр; склад — без цен (Д-24). */
export default async function ExpensesPage({
  params,
}: PageProps<"/objects/[projectId]/procurement/expenses">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "supplier_invoices.view");
  const prices = hasPermission(org, "prices.view");
  const [rows, categories, suppliers] = await Promise.all([
    listExpenseRows(org.id, project.id, { prices }),
    listExpenseCategories(org.id),
    listSupplierOptions(org.id),
  ]);
  return (
    <>
      <PageHeader
        title="Затраты"
        description="Строки всех накладных объекта: материалы, продукты, инвентарь, услуги и транспорт. Исправляют — в накладной."
      />
      <ExpensesTable
        rows={rows}
        categories={categories}
        suppliers={suppliers}
        withPrices={prices}
      />
    </>
  );
}
