"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";

import { DataTable, type DataTableFeatures } from "@/components/data-table";
import { ObjectLink } from "@/components/object-link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONE } from "../labels";
import type { RequestListRow } from "../queries";

const helper = createColumnHelper<DataTableFeatures, RequestListRow>();

const columns = helper.columns([
  helper.accessor("number", {
    header: "Номер",
    cell: (info) => (
      <ObjectLink
        path={`/procurement/requests/${info.row.original.id}`}
        className="font-medium hover:underline"
      >
        {info.getValue() ?? "Черновик"}
      </ObjectLink>
    ),
  }),
  helper.accessor("docDate", { header: "Дата", cell: (info) => formatDate(info.getValue()) }),
  helper.accessor("linesCount", { header: "Позиций" }),
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
]);

export function RequestsTable({ rows }: { rows: RequestListRow[] }) {
  return <DataTable columns={columns} data={rows} empty="Заявок по выбранным условиям нет" />;
}
