import type { Metadata } from "next";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { OperationsTable } from "@/features/finance/components/finance-tables";
import { CASH_STATUS_LABELS, CATEGORY_LABELS } from "@/features/finance/labels";
import { listAccounts, listOperations } from "@/features/finance/queries";
import { operationsFilterSchema } from "@/features/finance/schemas";

import { financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Операции" };

export default async function OperationsPage({
  params,
  searchParams,
}: {
  params: ScopedParams;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org, scope } = await financeScope(params, "cash.view");
  const f = operationsFilterSchema.parse(await searchParams);
  const [rows, accounts] = await Promise.all([
    listOperations(org.id, scope.projectId, f),
    listAccounts(org.id, false, scope.projectId),
  ]);

  return (
    <>
      <PageHeader
        title="Журнал кассовых операций"
        description={
          scope.projectId === null
            ? "Операции без объекта: приходы, расходы, оплаты и их сторно."
            : "Приходы, расходы, оплаты по объекту и их сторно."
        }
      />
      <FiltersBar
        fields={[
          { name: "q", label: "Номер", type: "search", placeholder: "ПКО-… / РКО-…" },
          {
            name: "account",
            label: "Касса",
            type: "select",
            options: accounts.map((a) => ({ value: a.id, label: a.name })),
          },
          {
            name: "direction",
            label: "Направление",
            type: "select",
            options: [
              { value: "IN", label: "Приход" },
              { value: "OUT", label: "Расход" },
            ],
          },
          {
            name: "category",
            label: "Вид",
            type: "select",
            options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            name: "status",
            label: "Статус",
            type: "select",
            options: Object.entries(CASH_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            name: "reversal",
            label: "Сторно",
            type: "select",
            options: [{ value: "pending", label: "На согласовании" }],
          },
          { name: "from", label: "С даты", type: "date" },
          { name: "to", label: "По дату", type: "date" },
        ]}
      />
      <OperationsTable rows={rows} />
    </>
  );
}
