"use client";

import { DocumentActions } from "@/components/document-actions";
import { decideReceiptCorrection } from "@/features/procurement/actions";

import { reverseDocument } from "../actions";

/** Сторно выдачи/возврата (причина обязательна). */
export function ReverseAction({ kind, id }: { kind: "issue" | "return"; id: string }) {
  return (
    <DocumentActions
      actions={[
        {
          id: "reverse",
          label: kind === "issue" ? "Сторнировать выдачу" : "Сторнировать возврат",
          variant: "outline",
          comment: {
            title: "Сторно",
            description: "Документ останется в истории, остаток будет восстановлен.",
            label: "Причина",
            required: true,
          },
          run: ({ key, comment }) => reverseDocument(kind, { id, key, comment }),
          successMessage: "Сторнировано",
        },
      ]}
    />
  );
}

/** Решение бухгалтера по корректировке приёмки (Д-06). */
export function CorrectionDecision({ id }: { id: string }) {
  return (
    <DocumentActions
      actions={[
        {
          id: "approve",
          label: "Согласовать",
          run: ({ key, comment }) => decideReceiptCorrection("approve", { id, key, comment }),
          successMessage: "Корректировка согласована и проведена",
        },
        {
          id: "return",
          label: "Вернуть складу",
          variant: "outline",
          comment: { title: "Вернуть на доработку", label: "Что исправить", required: true },
          run: ({ key, comment }) => decideReceiptCorrection("return", { id, key, comment }),
          successMessage: "Корректировка возвращена складу",
        },
      ]}
    />
  );
}
