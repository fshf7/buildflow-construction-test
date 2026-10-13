export type WorkActStatus = "DRAFT" | "REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED";

export const WORK_ACT_STATUS_LABELS: Record<WorkActStatus, string> = {
  DRAFT: "Черновик",
  REVIEW: "Проверка",
  APPROVED: "Утверждён",
  REJECTED: "Отклонён",
  CANCELLED: "Отменён",
};

export const WORK_ACT_STATUS_VARIANT: Record<
  WorkActStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  REVIEW: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  CANCELLED: "outline",
};
