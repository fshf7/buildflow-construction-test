"use client";

import { createColumnHelper } from "@tanstack/react-table";

import { DataTable, type DataTableFeatures } from "@/components/data-table";
import { ObjectLink } from "@/components/object-link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

import {
  ISSUE_STATUS_LABELS,
  RECEIPT_STATUS_LABELS,
  type IssueStatus,
  type ReceiptStatus,
} from "../labels";
import type { JournalRow } from "../queries";

const KIND: Record<JournalRow["kind"], string> = {
  receipt: "Приёмка",
  issue: "Выдача",
  return: "Возврат",
};
const helper = createColumnHelper<DataTableFeatures, JournalRow>();
const columns = helper.columns([
  helper.accessor("kind", { header: "Документ", cell: (info) => KIND[info.getValue()] }),
  helper.accessor("number", {
    header: "Номер",
    cell: (info) => (
      <ObjectLink path={info.row.original.path} className="font-medium hover:underline">
        {info.getValue() ?? "Черновик"}
      </ObjectLink>
    ),
  }),
  helper.accessor("docDate", { header: "Дата", cell: (info) => formatDate(info.getValue()) }),
  helper.accessor("counterparty", { header: "Поставщик / бригада" }),
  helper.accessor("status", {
    header: "Статус",
    cell: (info) => (
      <Badge variant="outline">
        {info.row.original.kind === "receipt"
          ? RECEIPT_STATUS_LABELS[info.getValue() as ReceiptStatus]
          : ISSUE_STATUS_LABELS[info.getValue() as IssueStatus]}
      </Badge>
    ),
  }),
]);

export function JournalTable({ rows }: { rows: JournalRow[] }) {
  return <DataTable columns={columns} data={rows} empty="Документов нет" />;
}
