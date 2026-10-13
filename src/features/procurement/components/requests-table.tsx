"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { DataTable, type DataTableFeatures } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";

import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONE } from "../labels";
import type { RequestListRow } from "../queries";

const helper = createColumnHelper<DataTableFeatures, RequestListRow>();

const baseColumns = [
  helper.accessor("number", {
    header: "Номер",
    cell: (info) => (
      <Link
        href={`/procurement/requests/${info.row.original.id}`}
        className="font-medium hover:underline"
      >
        {info.getValue() ?? "Черновик"}
      </Link>
    ),
  }),
  helper.accessor("docDate", { header: "Дата", cell: (info) => formatDate(info.getValue()) }),
  helper.accessor("projectLabel", { header: "Объект" }),
  helper.accessor("suppliers", {
    header: "Поставщики",
    cell: (info) => info.getValue().join(", ") || "—",
  }),
  helper.accessor("status", {
    header: "Статус",
    cell: (info) => (
      <span className="flex items-center gap-1">
        <Badge variant={REQUEST_STATUS_TONE[info.getValue()]}>
          {REQUEST_STATUS_LABELS[info.getValue()]}
        </Badge>
        {info.row.original.hasDiscrepancy ? (
          <AlertTriangle className="size-4 text-amber-600" aria-label="Есть расхождение" />
        ) : null}
      </span>
    ),
  }),
];

const totalColumn = helper.accessor("total", {
  header: "Сумма",
  cell: (info) => (
    <span className="whitespace-nowrap">
      {formatMoney(info.getValue(), info.row.original.currency)}
    </span>
  ),
});

const columnsWithPrices = helper.columns([...baseColumns, totalColumn]);
const columnsWithoutPrices = helper.columns(baseColumns);

export function RequestsTable({
  rows,
  withPrices,
}: {
  rows: RequestListRow[];
  withPrices: boolean;
}) {
  return (
    <DataTable
      columns={withPrices ? columnsWithPrices : columnsWithoutPrices}
      data={rows}
      empty="Заявок по выбранным условиям нет"
    />
  );
}
