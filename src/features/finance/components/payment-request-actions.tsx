"use client";

import { useRouter } from "next/navigation";

import { DocumentActions, type DocumentAction } from "@/components/document-actions";

import { useFinanceScope } from "./finance-scope";
import { deleteFinanceDraft, runPaymentRequestOp } from "../actions";
import type { PaymentRequestStatus } from "../labels";

/** Действия по счёту (§4.5): автор — отправить/отменить; согласующий — согласовать/вернуть (Д-14, Д-15). */
export function PaymentRequestActions({
  id,
  status,
  canCreate,
  canApprove,
  isAuthor,
  hasNumber,
  paid,
}: {
  id: string;
  status: PaymentRequestStatus;
  canCreate: boolean;
  canApprove: boolean;
  isAuthor: boolean;
  hasNumber: boolean;
  paid: number;
}) {
  const router = useRouter();
  const scope = useFinanceScope();
  const op =
    (name: Parameters<typeof runPaymentRequestOp>[0]) =>
    ({ key, comment }: { key: string; comment: string }) =>
      runPaymentRequestOp(name, { id, key, comment });
  const cancel: DocumentAction = {
    id: "cancel",
    label: "Отменить счёт",
    variant: "outline",
    comment: { title: "Отмена счёта", label: "Причина", required: true },
    run: op("cancel_payment_request"),
    successMessage: "Счёт отменён",
  };
  const actions: DocumentAction[] = [];

  if (status === "DRAFT" && canCreate) {
    actions.push({
      id: "submit",
      label: "На согласование",
      run: op("submit_payment_request"),
      successMessage: "Отправлено на согласование",
    });
    actions.push(
      hasNumber
        ? cancel
        : {
            id: "delete",
            label: "Удалить черновик",
            variant: "destructive",
            run: async () => {
              const r = await deleteFinanceDraft("PAYMENT_REQUEST", id);
              if (r.ok) router.push(`${scope.base}/requests`);
              return r;
            },
            successMessage: "Черновик удалён",
          },
    );
  }
  // Свой счёт не согласовать (Д-14) — кнопки не показываем; БД проверит в любом случае.
  if (status === "APPROVAL" && canApprove && !isAuthor) {
    actions.push({
      id: "approve",
      label: "Согласовать",
      run: op("approve_payment_request"),
      successMessage: "Счёт согласован",
    });
    actions.push({
      id: "return",
      label: "Вернуть на доработку",
      variant: "outline",
      comment: { title: "Вернуть на доработку", label: "Что исправить", required: true },
      run: op("return_payment_request"),
      successMessage: "Счёт возвращён",
    });
  }
  if (
    (status === "APPROVAL" && (canCreate || canApprove)) ||
    (status === "APPROVED" && paid === 0 && (canCreate || canApprove))
  ) {
    actions.push(cancel);
  }
  return <DocumentActions actions={actions} />;
}
