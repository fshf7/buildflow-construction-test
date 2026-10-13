import type { Metadata } from "next";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { DebtsTable } from "@/features/finance/components/finance-tables";
import { groupBySupplier, listPayables } from "@/features/finance/queries";
import { payablesFilterSchema } from "@/features/finance/schemas";
import { listProjectOptions, listSupplierOptions } from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Долги поставщикам" };

// US-05: долги поставщиков с учётом частичных оплат. Долг = обязательства − оплаты (§7 ТЗ).
export default async function PayablesPage({ searchParams }: PageProps<"/finance/payables">) {
  const org = await requirePermission("payables.view");
  const f = payablesFilterSchema.parse(await searchParams);
  const [rows, suppliers, projects] = await Promise.all([
    listPayables(org.id, {
      supplier: f.supplier,
      project: f.project,
      openOnly: f.status !== "all",
    }),
    listSupplierOptions(org.id),
    listProjectOptions(org.id),
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
            name: "project",
            label: "Объект",
            type: "select",
            options: projects.map((p) => ({ value: p.id, label: p.label })),
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
