"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";

import { DataTable, type DataTableFeatures } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";

import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONE } from "../labels";
import type { InvoiceListRow } from "../queries";

const helper = createColumnHelper<DataTableFeatures, InvoiceListRow>();

const base = [
  helper.accessor("number", {
    header: "Номер",
    cell: (info) => (
      <Link
        href={`/procurement/invoices/${info.row.original.id}`}
        className="font-medium hover:underline"
      >
        {info.getValue() ?? "Введена"}
      </Link>
    ),
  }),
  helper.accessor("supplierName", {
    header: "Поставщик / № документа",
    cell: (info) => (
      <span>
        {info.getValue()}
        <span className="block text-xs text-muted-foreground">
          № {info.row.original.supplierDocNumber} от {formatDate(info.row.original.supplierDocDate)}
        </span>
      </span>
    ),
  }),
  helper.accessor("projectLabel", { header: "Объект" }),
  helper.accessor("requestNumber", { header: "Заявка", cell: (info) => info.getValue() ?? "—" }),
  helper.accessor("status", {
    header: "Статус",
    cell: (info) => (
      <Badge variant={INVOICE_STATUS_TONE[info.getValue()]}>
        {INVOICE_STATUS_LABELS[info.getValue()]}
      </Badge>
    ),
  }),
];
const total = helper.accessor("total", {
  header: "Сумма",
  cell: (info) => (
    <span className="whitespace-nowrap">
      {formatMoney(info.getValue(), info.row.original.currency)}
    </span>
  ),
});
const withPricesColumns = helper.columns([...base, total]);
const withoutPricesColumns = helper.columns(base);

export function InvoicesTable({
  rows,
  withPrices,
}: {
  rows: InvoiceListRow[];
  withPrices: boolean;
}) {
  return (
    <DataTable
      columns={withPrices ? withPricesColumns : withoutPricesColumns}
      data={rows}
      empty="Накладных по выбранным условиям нет"
    />
  );
}
