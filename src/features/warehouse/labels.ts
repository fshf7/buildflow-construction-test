import type { Database } from "@/lib/supabase/database.types";

export type ReceiptStatus = Database["public"]["Enums"]["goods_receipt_status"];
export type IssueStatus = Database["public"]["Enums"]["issue_status"];

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  DRAFT: "Черновик",
  CORRECTION_APPROVAL: "На согласовании",
  POSTED: "Проведён",
  CORRECTED: "Корректировка",
};

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  DRAFT: "Черновик",
  POSTED: "Проведён",
  REVERSED: "Сторнирован",
};

export const MOVEMENT_LABELS: Record<Database["public"]["Enums"]["stock_movement_type"], string> = {
  RECEIPT: "Приёмка",
  RECEIPT_REVERSAL: "Сторно приёмки",
  ISSUE: "Выдача",
  ISSUE_REVERSAL: "Сторно выдачи",
  RETURN: "Возврат",
  RETURN_REVERSAL: "Сторно возврата",
  OPENING: "Начальный остаток",
  ADJUSTMENT: "Корректировка",
};
