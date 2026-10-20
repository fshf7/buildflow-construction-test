"use client";

import { createColumnHelper } from "@tanstack/react-table";

import { DataTable, type DataTableFeatures } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  CASH_STATUS_LABELS,
  CATEGORY_LABELS,
  PAYMENT_REQUEST_STATUS_LABELS,
  PURPOSE_LABELS,
} from "../labels";
import { FinanceLink } from "./finance-scope";
import type { OperationRow, PaymentRequestRow, SupplierDebt } from "../queries";

// ---- Долги по поставщикам (US-05) ----
const debtHelper = createColumnHelper<DataTableFeatures, SupplierDebt>();
const debtColumns = debtHelper.columns([
  debtHelper.accessor("supplierName", {
    header: "Поставщик",
    cell: (info) => (
      <FinanceLink
        path={`/payables/${info.row.original.supplierId}`}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </FinanceLink>
    ),
  }),
  debtHelper.accessor("count", { header: "Обязательств" }),
  debtHelper.accessor("amount", {
    header: "Начислено",
    cell: (i) => formatMoney(i.getValue(), i.row.original.currency),
  }),
  debtHelper.accessor("paid", {
    header: "Оплачено",
    cell: (i) => formatMoney(i.getValue(), i.row.original.currency),
  }),
  debtHelper.accessor("remaining", {
    header: "Долг",
    cell: (i) => (
      <b className="whitespace-nowrap">{formatMoney(i.getValue(), i.row.original.currency)}</b>
    ),
  }),
]);
export function DebtsTable({ rows }: { rows: SupplierDebt[] }) {
  return <DataTable columns={debtColumns} data={rows} empty="Долгов нет" />;
}

// ---- Журнал операций ----
const opHelper = createColumnHelper<DataTableFeatures, OperationRow>();
const opColumns = opHelper.columns([
  opHelper.accessor("number", {
    header: "Номер",
    cell: (info) => (
      <FinanceLink
        path={`/operations/${info.row.original.id}`}
        className="font-medium hover:underline"
      >
        {info.getValue() ?? (info.row.original.kind === "OPENING" ? "Ввод остатков" : "Черновик")}
      </FinanceLink>
    ),
  }),
  opHelper.accessor("docDate", { header: "Дата", cell: (i) => formatDate(i.getValue()) }),
  opHelper.accessor("accountName", { header: "Касса" }),
  opHelper.accessor("category", {
    header: "Вид",
    cell: (i) =>
      i.row.original.kind === "REVERSAL"
        ? `Сторно: ${CATEGORY_LABELS[i.getValue()]}`
        : CATEGORY_LABELS[i.getValue()],
  }),
  opHelper.accessor("counterparty", { header: "Контрагент", cell: (i) => i.getValue() || "—" }),
  opHelper.accessor("amount", {
    header: "Сумма",
    cell: (i) => (
      <span
        className={cn(
          "whitespace-nowrap tabular-nums",
          i.row.original.direction === "IN" ? "text-emerald-700" : "",
        )}
      >
        {i.row.original.direction === "IN" ? "+" : "−"}
        {formatMoney(i.getValue(), i.row.original.currency)}
      </span>
    ),
  }),
  opHelper.accessor("status", {
    header: "Статус",
    cell: (i) => (
      <Badge variant={i.getValue() === "POSTED" ? "outline" : "secondary"}>
        {CASH_STATUS_LABELS[i.getValue()]}
      </Badge>
    ),
  }),
]);
export function OperationsTable({ rows }: { rows: OperationRow[] }) {
  return <DataTable columns={opColumns} data={rows} empty="Операций по выбранным условиям нет" />;
}

// ---- Счета на оплату ----
const prHelper = createColumnHelper<DataTableFeatures, PaymentRequestRow>();
const prColumns = prHelper.columns([
  prHelper.accessor("number", {
    header: "Номер",
    cell: (info) => (
      <FinanceLink
        path={`/requests/${info.row.original.id}`}
        className="font-medium hover:underline"
      >
        {info.getValue() ?? "Черновик"}
      </FinanceLink>
    ),
  }),
  prHelper.accessor("docDate", { header: "Дата", cell: (i) => formatDate(i.getValue()) }),
  prHelper.accessor("purpose", { header: "Назначение", cell: (i) => PURPOSE_LABELS[i.getValue()] }),
  prHelper.accessor("payee", { header: "Получатель" }),
  prHelper.accessor("amount", {
    header: "Сумма",
    cell: (i) => formatMoney(i.getValue(), i.row.original.currency),
  }),
  prHelper.accessor("remaining", {
    header: "К оплате",
    cell: (i) => formatMoney(i.getValue(), i.row.original.currency),
  }),
  prHelper.accessor("status", {
    header: "Статус",
    cell: (i) => <Badge variant="outline">{PAYMENT_REQUEST_STATUS_LABELS[i.getValue()]}</Badge>,
  }),
]);
export function PaymentRequestsTable({ rows }: { rows: PaymentRequestRow[] }) {
  return <DataTable columns={prColumns} data={rows} empty="Счетов на оплату нет" />;
}
