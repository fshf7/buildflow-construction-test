"use client";

import { useRouter } from "next/navigation";

import { DocumentActions, type DocumentAction } from "@/components/document-actions";

import { deleteOpening, postOpening, reverseOpening } from "../actions";

export function OpeningActions({
  id,
  status,
}: {
  id: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
}) {
  const router = useRouter();
  const actions: DocumentAction[] =
    status === "DRAFT"
      ? [
          {
            id: "post",
            label: "Провести",
            run: ({ key }) => postOpening({ id, key }),
            successMessage: "Остатки введены",
          },
          {
            id: "delete",
            label: "Удалить черновик",
            variant: "destructive",
            run: async () => {
              const r = await deleteOpening(id);
              if (r.ok) router.push("/opening");
              return r;
            },
            successMessage: "Черновик удалён",
          },
        ]
      : status === "POSTED"
        ? [
            {
              id: "reverse",
              label: "Сторнировать",
              variant: "outline",
              comment: {
                title: "Сторно ввода остатков",
                description:
                  "Остатки будут уменьшены обратными записями. Нельзя, если остаток уже израсходован или долг оплачен.",
                label: "Причина",
                required: true,
              },
              run: ({ key, comment }) => reverseOpening({ id, key, comment }),
              successMessage: "Ввод остатков сторнирован",
            },
          ]
        : [];
  return <DocumentActions actions={actions} />;
}
