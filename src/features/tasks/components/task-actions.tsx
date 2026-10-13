"use client";

import { DocumentActions } from "@/components/document-actions";

import { changeTaskStatus } from "../actions";
import { taskMoves, type TaskStatus } from "../labels";

/** Крупные кнопки переходов задачи — под палец на телефоне (US-10). */
export function TaskActions({
  id,
  status,
  executor,
  manager,
}: {
  id: string;
  status: TaskStatus;
  executor: boolean;
  manager: boolean;
}) {
  const moves = taskMoves(status, { executor, manager });
  return (
    <DocumentActions
      actions={moves.map((m, i) => ({
        id: m.to + i,
        label: m.label,
        variant: i === 0 && !m.comment ? "default" : "outline",
        comment: m.comment ? { ...m.comment, required: true } : undefined,
        run: ({ key, comment }) => changeTaskStatus({ id, key, status: m.to, comment }),
        successMessage: "Статус задачи изменён",
      }))}
    />
  );
}
