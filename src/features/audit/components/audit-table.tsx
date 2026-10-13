"use client";

import { createColumnHelper } from "@tanstack/react-table";

import { DataTable, type DataTableFeatures } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

import { ACTION_LABELS, TABLE_LABELS } from "../labels";
import type { AuditRow } from "../queries";

const helper = createColumnHelper<DataTableFeatures, AuditRow>();

const columns = helper.columns([
  helper.accessor("occurredAt", {
    header: "Когда",
    cell: (info) => <span className="whitespace-nowrap">{formatDateTime(info.getValue())}</span>,
  }),
  helper.accessor("actorName", { header: "Кто" }),
  helper.accessor("action", {
    header: "Действие",
    cell: (info) => ACTION_LABELS[info.getValue()] ?? info.getValue(),
  }),
  helper.accessor("tableName", {
    header: "Что",
    cell: (info) => (
      <span>
        {TABLE_LABELS[info.getValue()] ?? info.getValue()}
        {info.row.original.title ? (
          <span className="text-muted-foreground"> · {info.row.original.title}</span>
        ) : null}
      </span>
    ),
  }),
  helper.accessor("changed", {
    header: "Подробности",
    cell: (info) =>
      info.row.original.details ?? (info.getValue().length ? info.getValue().join(", ") : "—"),
  }),
]);

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return <DataTable columns={columns} data={rows} empty="Записей пока нет" />;
}
