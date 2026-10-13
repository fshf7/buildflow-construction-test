import type { Database } from "@/lib/supabase/database.types";

export type RequestStatus = Database["public"]["Enums"]["purchase_request_status"];
export type InvoiceStatus = Database["public"]["Enums"]["supplier_invoice_status"];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "Черновик",
  ISSUED: "Передана",
  PARTIALLY_RECEIVED: "Частично получена",
  RECEIVED: "Получена",
  ACCOUNTING_REVIEW: "Проверка",
  DISCREPANCY: "Расхождение",
  CLOSED: "Закрыта",
  CANCELLED: "Отменена",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  ENTERED: "Введена",
  UNDER_REVIEW: "Проверяется",
  CONFIRMED: "Подтверждена",
  CANCELLED: "Отменена",
};

export type BadgeTone = "default" | "secondary" | "outline" | "destructive";

export const REQUEST_STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  DRAFT: "outline",
  ISSUED: "secondary",
  PARTIALLY_RECEIVED: "secondary",
  RECEIVED: "default",
  ACCOUNTING_REVIEW: "secondary",
  DISCREPANCY: "destructive",
  CLOSED: "outline",
  CANCELLED: "outline",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  ENTERED: "outline",
  UNDER_REVIEW: "secondary",
  CONFIRMED: "default",
  CANCELLED: "outline",
};
