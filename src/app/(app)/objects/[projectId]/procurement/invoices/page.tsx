import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listExpenseCategories } from "@/features/catalog/queries";
import { ExpensesGrid } from "@/features/procurement/components/expenses-grid";
import { listExpenseRows } from "@/features/procurement/queries";
import { requireObject } from "@/features/projects/object";
import {
  listMaterialOptions,
  listSupplierOptions,
  listUnitOptions,
} from "@/features/shared/lookups";
import { hasPermission } from "@/lib/auth/access-model";
import { businessToday } from "@/lib/format";

export const metadata: Metadata = { title: "Затраты" };

/**
 * Журнал затрат объекта (Д-97) — таблица как в Excel: строка = запись со своим долгом поставщику.
 * Склад видит количества без цен (Д-24), долги — у кого есть payables.view.
 */
export default async function ExpensesPage({
  params,
}: PageProps<"/objects/[projectId]/procurement/invoices">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "supplier_invoices.view");
  const access = {
    prices: hasPermission(org, "prices.view"),
    debts: hasPermission(org, "payables.view"),
  };
  const canEdit = hasPermission(org, "supplier_invoices.manage") && access.prices;
  const [rows, categories, suppliers, units, materials] = await Promise.all([
    listExpenseRows(org.id, project.id, access),
    listExpenseCategories(org.id),
    listSupplierOptions(org.id),
    listUnitOptions(org.id),
    listMaterialOptions(org.id),
  ]);

  return (
    <>
      <PageHeader
        title="Затраты"
        description="Материалы, продукты, инвентарь, услуги и транспорт — по строке на запись. Внесённая строка сразу становится долгом поставщику у кассира."
      />
      <ExpensesGrid
        rows={rows}
        categories={categories}
        suppliers={suppliers}
        units={units}
        materials={materials}
        canEdit={canEdit}
        withPrices={access.prices}
        withDebts={access.debts}
        today={businessToday()}
      />
    </>
  );
}
