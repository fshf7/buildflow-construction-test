"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";

import { DataTable, type DataTableFeatures } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

import type { ProjectListRow } from "../queries";

const helper = createColumnHelper<DataTableFeatures, ProjectListRow>();

const columns = helper.columns([
  helper.accessor("code", { header: "Код" }),
  helper.accessor("name", {
    header: "Объект",
    cell: (info) => (
      <Link href={`/projects/${info.row.original.id}`} className="font-medium hover:underline">
        {info.getValue()}
        {info.row.original.address ? (
          <span className="block text-xs font-normal text-muted-foreground">
            {info.row.original.address}
          </span>
        ) : null}
      </Link>
    ),
  }),
  helper.accessor("startDate", {
    header: "Сроки",
    cell: (info) =>
      info.getValue() || info.row.original.endDate
        ? `${formatDate(info.getValue())} — ${formatDate(info.row.original.endDate)}`
        : "—",
  }),
  helper.accessor("status", {
    header: "Статус",
    cell: (info) =>
      info.getValue() === "ACTIVE" ? (
        <Badge variant="outline">В работе</Badge>
      ) : (
        <Badge variant="secondary">Архив</Badge>
      ),
  }),
]);

export function ProjectsTable({ projects }: { projects: ProjectListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={projects}
      empty="Объектов пока нет или они вам не назначены"
    />
  );
}
