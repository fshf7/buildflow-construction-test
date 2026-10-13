"use client";

import { useRouter } from "next/navigation";

import { DocumentActions, type DocumentAction } from "@/components/document-actions";

import { deleteDraft, runInvoiceOperation } from "../actions";
import type { InvoiceStatus } from "../labels";

/** Переходы накладной (§4.2). Подтверждение — сверка документа, автор может сам (Д-14). */
export function InvoiceActions({
  id,
  status,
  hasNumber,
}: {
  id: string;
  status: InvoiceStatus;
  hasNumber: boolean;
}) {
  const router = useRouter();
  const op =
    (operation: Parameters<typeof runInvoiceOperation>[0]) =>
    ({ key, comment }: { key: string; comment: string }) =>
      runInvoiceOperation(operation, { id, key, comment });

  const cancel: DocumentAction = {
    id: "cancel",
    label: "Отменить накладную",
    variant: "outline",
    comment: { title: "Отмена накладной", label: "Причина", required: true },
    run: op("cancel_supplier_invoice"),
    successMessage: "Накладная отменена",
  };

  const byStatus: Partial<Record<InvoiceStatus, DocumentAction[]>> = {
    ENTERED: [
      {
        id: "submit",
        label: "На проверку",
        run: op("submit_supplier_invoice"),
        successMessage: "Накладная на проверке",
      },
      ...(hasNumber
        ? [cancel]
        : [
            {
              id: "delete",
              label: "Удалить",
              variant: "destructive" as const,
              run: async () => {
                const result = await deleteDraft("SUPPLIER_INVOICE", id);
                if (result.ok) router.push("/procurement/invoices");
                return result;
              },
              successMessage: "Накладная удалена",
            },
          ]),
    ],
    UNDER_REVIEW: [
      {
        id: "confirm",
        label: "Подтвердить",
        run: op("confirm_supplier_invoice"),
        successMessage: "Накладная подтверждена — создано обязательство перед поставщиком",
      },
      {
        id: "return",
        label: "Вернуть на исправление",
        variant: "outline",
        run: op("return_supplier_invoice"),
        successMessage: "Накладную снова можно редактировать",
      },
      cancel,
    ],
    CONFIRMED: [cancel],
  };

  return <DocumentActions actions={byStatus[status] ?? []} />;
}
