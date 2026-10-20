"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DocumentActions, type DocumentAction } from "@/components/document-actions";
import { useObjectHref } from "@/components/object-context";

import { copyWorkAct, deleteWorkActDraft, runWorkActOp } from "../actions";
import type { WorkActStatus } from "../labels";
import type { WorkActOp } from "../schemas";

/**
 * Действия по акту (§4.6): автор — отправить, отменить, «создать на основе»; управляющий
 * закреплённого объекта — утвердить / отклонить (не свой акт, Д-14), отменить утверждённый без оплат.
 */
export function WorkActActions({
  id,
  status,
  isAuthor,
  canCreate,
  canApprove,
  paid,
}: {
  id: string;
  status: WorkActStatus;
  isAuthor: boolean;
  canCreate: boolean;
  canApprove: boolean;
  paid: number;
}) {
  const router = useRouter();
  const href = useObjectHref();
  const [newId] = useState(() => crypto.randomUUID());
  const op =
    (name: WorkActOp) =>
    ({ key, comment }: { key: string; comment: string }) =>
      runWorkActOp(name, { id, key, comment });
  const cancel: DocumentAction = {
    id: "cancel",
    label: "Отменить акт",
    variant: "outline",
    comment: { title: "Отмена акта", label: "Причина", required: true },
    run: op("cancel_work_act"),
    successMessage: "Акт отменён",
  };
  const actions: DocumentAction[] = [];

  if (status === "DRAFT" && canCreate && isAuthor) {
    actions.push({
      id: "submit",
      label: "Отправить управляющему",
      run: op("submit_work_act"),
      successMessage: "Акт отправлен управляющему",
    });
    actions.push({
      id: "delete",
      label: "Удалить черновик",
      variant: "destructive",
      run: async () => {
        const r = await deleteWorkActDraft(id);
        if (r.ok) router.push(href("/acts"));
        return r;
      },
      successMessage: "Черновик удалён",
    });
  }
  if (status === "REVIEW" && canApprove && !isAuthor) {
    actions.push({
      id: "approve",
      label: "Утвердить",
      run: op("approve_work_act"),
      successMessage: "Акт утверждён — поступил кассиру на оплату",
    });
    actions.push({
      id: "reject",
      label: "Отклонить",
      variant: "outline",
      comment: { title: "Отклонить акт", label: "Что не так", required: true },
      run: op("reject_work_act"),
      successMessage: "Акт отклонён",
    });
  }
  if (status === "REVIEW" && canCreate && isAuthor) actions.push(cancel);
  if (status === "APPROVED" && canApprove && paid === 0) actions.push(cancel);
  if ((status === "REJECTED" || status === "CANCELLED") && canCreate) {
    actions.push({
      id: "copy",
      label: "Создать на основе",
      variant: "outline",
      run: async () => {
        const r = await copyWorkAct({ sourceId: id, newId });
        if (r.ok) router.push(href(`/acts/${newId}/edit`));
        return r;
      },
      successMessage: "Создан новый черновик",
    });
  }
  return <DocumentActions actions={actions} />;
}
