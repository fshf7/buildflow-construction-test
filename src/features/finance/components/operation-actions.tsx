"use client";

import { DocumentActions } from "@/components/document-actions";

import { decideReversal, requestReversal } from "../actions";

/** Д-67: кассир запрашивает сторно с причиной. */
export function RequestReversal({ id }: { id: string }) {
  return (
    <DocumentActions
      actions={[
        {
          id: "request",
          label: "Запросить сторно",
          variant: "outline",
          comment: {
            title: "Запрос на сторно",
            description:
              "Сторно проведёт бухгалтер после согласования. До этого долги и баланс не меняются.",
            label: "Причина",
            required: true,
          },
          run: ({ key, comment }) => requestReversal({ id, key, comment }),
          successMessage: "Запрос на сторно отправлен бухгалтеру",
        },
      ]}
    />
  );
}

/** Д-67: решение бухгалтера по запросу сторно. */
export function ReversalDecision({ id }: { id: string }) {
  return (
    <DocumentActions
      actions={[
        {
          id: "approve",
          label: "Согласовать сторно",
          run: ({ key, comment }) => decideReversal("approve", { id, key, comment }),
          successMessage: "Сторно проведено: долги и баланс восстановлены",
        },
        {
          id: "reject",
          label: "Отклонить",
          variant: "outline",
          comment: { title: "Отклонить сторно", label: "Почему", required: true },
          run: ({ key, comment }) => decideReversal("reject", { id, key, comment }),
          successMessage: "Запрос на сторно отклонён",
        },
      ]}
    />
  );
}
