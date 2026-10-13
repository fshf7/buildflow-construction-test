"use client";

import { useRouter } from "next/navigation";

import { DocumentActions, type DocumentAction } from "@/components/document-actions";

import { deleteDraft, runRequestOperation } from "../actions";
import type { RequestStatus } from "../labels";

/** Переходы заявки по state machine §4.1; доступность окончательно проверяет БД. */
export function RequestActions({ id, status }: { id: string; status: RequestStatus }) {
  const router = useRouter();
  const op =
    (operation: Parameters<typeof runRequestOperation>[0]) =>
    ({ key, comment }: { key: string; comment: string }) =>
      runRequestOperation(operation, { id, key, comment });

  const cancel: DocumentAction = {
    id: "cancel",
    label: "Отменить заявку",
    variant: "outline",
    comment: { title: "Отмена заявки", label: "Причина", required: true },
    run: op("cancel_purchase_request"),
    successMessage: "Заявка отменена",
  };

  const byStatus: Partial<Record<RequestStatus, DocumentAction[]>> = {
    DRAFT: [
      {
        id: "issue",
        label: "Выдать в работу",
        run: op("issue_purchase_request"),
        successMessage: "Заявка передана",
      },
      cancel,
      {
        id: "delete",
        label: "Удалить черновик",
        variant: "destructive",
        run: async () => {
          const result = await deleteDraft("PURCHASE_REQUEST", id);
          if (result.ok) router.push("/procurement/requests");
          return result;
        },
        successMessage: "Черновик удалён",
      },
    ],
    ISSUED: [cancel],
    PARTIALLY_RECEIVED: [
      {
        id: "review",
        label: "Начать проверку",
        variant: "secondary",
        run: op("start_purchase_review"),
        successMessage: "Заявка на проверке (оставшееся не довезут)",
      },
    ],
    RECEIVED: [
      {
        id: "review",
        label: "Начать проверку",
        run: op("start_purchase_review"),
        successMessage: "Заявка на проверке",
      },
    ],
    ACCOUNTING_REVIEW: [
      {
        id: "close",
        label: "Закрыть заявку",
        run: op("close_purchase_request"),
        successMessage: "Заявка закрыта",
      },
      {
        id: "discrepancy",
        label: "Отметить расхождение",
        variant: "outline",
        comment: { title: "Расхождение по заявке", label: "Что не сходится", required: true },
        run: op("mark_purchase_discrepancy"),
        successMessage: "Расхождение отмечено",
      },
    ],
    DISCREPANCY: [
      {
        id: "resolve",
        label: "Снять расхождение",
        comment: {
          title: "Расхождение урегулировано",
          // TODO(TZ-open): правила разрешения расхождений заказ/приёмка не определены (Д-53).
          description:
            "Опишите, как урегулировано (правила разрешения расхождений ТЗ пока не определяет).",
          label: "Комментарий",
          required: true,
        },
        run: op("resolve_purchase_discrepancy"),
        successMessage: "Заявка снова на проверке",
      },
    ],
  };

  return <DocumentActions actions={byStatus[status] ?? []} />;
}
