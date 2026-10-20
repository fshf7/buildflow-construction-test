import type { Metadata } from "next";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { DebtsTable } from "@/features/finance/components/finance-tables";
import { groupBySupplier, listPayables } from "@/features/finance/queries";
import { payablesFilterSchema } from "@/features/finance/schemas";
import { listSupplierOptions } from "@/features/shared/lookups";
import { formatMoney } from "@/lib/format";

import { financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Долги поставщикам" };

// US-05: долги поставщиков с учётом частичных оплат. Долг = обязательства − оплаты (§7 ТЗ).
// Д-94: в объекте — долги по его накладным; в «Общем» — долги без объекта (ввод остатков).
export default async function PayablesPage({
  params,
  searchParams,
}: {
  params: ScopedParams;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org, scope } = await financeScope(params, "payables.view");
  const f = payablesFilterSchema.parse(await searchParams);
  const [rows, suppliers] = await Promise.all([
    listPayables(org.id, {
      supplier: f.supplier,
      project: scope.projectId,
      openOnly: f.status !== "all",
    }),
    listSupplierOptions(org.id),
  ]);
  const debts = groupBySupplier(rows);
  const totals = new Map<string, number>();
  for (const d of debts)
    totals.set(d.currency, Math.round(((totals.get(d.currency) ?? 0) + d.remaining) * 100) / 100);

  return (
    <>
      <PageHeader
        title="Долги поставщикам"
        description={
          [...totals].map(([c, v]) => `Итого долг: ${formatMoney(v, c)}`).join(" · ") ||
          "Долгов нет"
        }
      />
      <FiltersBar
        fields={[
          {
            name: "supplier",
            label: "Поставщик",
            type: "select",
            options: suppliers.map((s) => ({ value: s.id, label: s.label })),
          },
          {
            name: "status",
            label: "Показать",
            type: "select",
            options: [{ value: "all", label: "Включая оплаченные" }],
          },
        ]}
      />
      <DebtsTable rows={debts} />
    </>
  );
}
