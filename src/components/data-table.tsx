"use client";

import { tableFeatures, useTable, type ColumnDef, type RowData } from "@tanstack/react-table";

import { Pager, usePagination } from "@/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// TanStack Table v9: набор возможностей задаётся явно; пока — только базовая модель строк.
const features = tableFeatures({});
export type DataTableFeatures = typeof features;

/**
 * Простая таблица списка. Колонки определяются в клиентском компоненте раздела
 * (createColumnHelper<DataTableFeatures, Row>()) и должны быть стабильны (на уровне модуля).
 * Больше 30 строк — по страницам (Д-108, ?page=).
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  empty = "Пока ничего нет",
}: {
  columns: ColumnDef<DataTableFeatures, TData, unknown>[];
  data: TData[];
  empty?: string;
}) {
  const paging = usePagination(data.length);
  const table = useTable({ features, columns, data: paging.slice(data) });

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-20 text-center text-muted-foreground"
                >
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pager paging={paging} />
    </div>
  );
}
