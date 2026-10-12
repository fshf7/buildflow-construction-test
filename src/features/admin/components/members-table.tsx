"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";

import { DataTable, type DataTableFeatures } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/auth/permissions";

import type { MemberRow } from "../queries";

const helper = createColumnHelper<DataTableFeatures, MemberRow>();

const columns = helper.columns([
  helper.accessor("fullName", {
    header: "Участник",
    cell: (info) => (
      <Link href={`/admin/members/${info.row.original.id}`} className="font-medium hover:underline">
        {info.getValue()}
        <span className="block text-xs font-normal text-muted-foreground">
          {info.row.original.email}
        </span>
      </Link>
    ),
  }),
  helper.accessor("roles", {
    header: "Роли",
    cell: (info) => (
      <div className="flex flex-wrap gap-1">
        {info.getValue().map((r) => (
          <Badge key={r} variant="secondary">
            {ROLE_LABELS[r]}
          </Badge>
        ))}
      </div>
    ),
  }),
  helper.accessor("allProjects", {
    header: "Объекты",
    cell: (info) => (info.getValue() ? "Все" : String(info.row.original.projectIds.length)),
  }),
  helper.accessor("isActive", {
    header: "Статус",
    cell: (info) =>
      info.getValue() ? (
        <Badge variant="outline">Активен</Badge>
      ) : (
        <Badge variant="destructive">Отключён</Badge>
      ),
  }),
]);

export function MembersTable({ members }: { members: MemberRow[] }) {
  return <DataTable columns={columns} data={members} empty="Участников пока нет" />;
}
