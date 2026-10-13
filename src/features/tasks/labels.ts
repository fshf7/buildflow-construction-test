export type TaskStatus = "NEW" | "IN_PROGRESS" | "ON_REVIEW" | "DONE" | "BLOCKED" | "CANCELLED";
export type TaskPriority = "LOW" | "NORMAL" | "HIGH";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  DONE: "Выполнена",
  BLOCKED: "Заблокирована",
  CANCELLED: "Отменена",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Низкий",
  NORMAL: "Обычный",
  HIGH: "Высокий",
};

const FINAL: readonly TaskStatus[] = ["DONE", "CANCELLED"];

/** Просрочка: срок прошёл (по дате Душанбе), задача не закрыта. Только подсветка — уведомлений нет (фаза 5). */
export function isOverdue(dueDate: string | null, status: TaskStatus, today: string): boolean {
  return Boolean(dueDate) && dueDate! < today && !FINAL.includes(status);
}

export type TaskMove = {
  to: TaskStatus;
  label: string;
  comment?: { title: string; label: string };
};

/**
 * Доступные переходы для кнопок (§4.8) — зеркало change_task_status; окончательную проверку делает БД.
 * Исполнитель: в работу, на проверку, заблокировать/разблокировать. Управляющий: принять, вернуть, отменить.
 */
export function taskMoves(
  status: TaskStatus,
  role: { executor: boolean; manager: boolean },
): TaskMove[] {
  const moves: TaskMove[] = [];
  const any = role.executor || role.manager;
  if (status === "NEW" && role.executor) moves.push({ to: "IN_PROGRESS", label: "Взять в работу" });
  if (status === "BLOCKED" && any) moves.push({ to: "IN_PROGRESS", label: "Снять блокировку" });
  if (status === "IN_PROGRESS" && role.executor)
    moves.push({ to: "ON_REVIEW", label: "Готово — на проверку" });
  if (status === "ON_REVIEW" && role.manager) {
    moves.push({ to: "DONE", label: "Принять — выполнена" });
    moves.push({
      to: "IN_PROGRESS",
      label: "Вернуть в работу",
      comment: { title: "Вернуть в работу", label: "Что доделать" },
    });
  }
  if ((status === "NEW" || status === "IN_PROGRESS") && any) {
    moves.push({
      to: "BLOCKED",
      label: "Заблокирована",
      comment: { title: "Задача заблокирована", label: "Причина" },
    });
  }
  if (role.manager && !FINAL.includes(status)) {
    moves.push({
      to: "CANCELLED",
      label: "Отменить задачу",
      comment: { title: "Отмена задачи", label: "Причина" },
    });
  }
  return moves;
}
