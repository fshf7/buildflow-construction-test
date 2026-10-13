"use client";

import { DocumentActions } from "@/components/document-actions";

import { reverseOperation } from "../actions";

/** Сторно кассовой операции (§4.7): причина обязательна. */
export function ReverseOperation({ id }: { id: string }) {
  return (
    <DocumentActions
      actions={[
        {
          id: "reverse",
          label: "Сторнировать",
          variant: "outline",
          comment: {
            title: "Сторно операции",
            description:
              "Будет проведена обратная операция со своим номером; долги и баланс кассы восстановятся.",
            label: "Причина",
            required: true,
          },
          run: ({ key, comment }) => reverseOperation({ id, key, comment }),
          successMessage: "Операция сторнирована",
        },
      ]}
    />
  );
}
