import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type CashCategory = Enums["cash_category"];
export type CashStatus = Enums["cash_tx_status"];
export type PaymentRequestStatus = Enums["payment_request_status"];
export type PaymentPurpose = Enums["payment_purpose"];
export type PayableStatus = Enums["payable_status"];

export const INCOME_CATEGORIES = ["APARTMENT_SALE", "OWNER_FUNDS", "OTHER_INCOME"] as const;

export const CATEGORY_LABELS: Record<CashCategory, string> = {
  APARTMENT_SALE: "Продажа квартир",
  OWNER_FUNDS: "Средства владельца",
  OTHER_INCOME: "Прочий приход",
  SUPPLIER: "Оплата поставщику",
  CREW_ACT: "Оплата акта бригады",
  OTHER_EXPENSE: "Прочий расход",
  SALARY: "Зарплата",
  CREW_EXTRA: "Выплата бригаде вне акта",
  OPENING_BALANCE: "Начальный остаток",
};

export const CASH_STATUS_LABELS: Record<CashStatus, string> = {
  DRAFT: "Черновик",
  POSTED: "Проведена",
  REVERSED: "Сторнирована",
};

export const PAYMENT_REQUEST_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  DRAFT: "Черновик",
  APPROVAL: "Согласование",
  APPROVED: "Согласован",
  PARTIALLY_PAID: "Частично оплачен",
  PAID: "Оплачен",
  CANCELLED: "Отменён",
};

export const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  OTHER_EXPENSE: "Прочий расход",
  SALARY: "Зарплата",
  CREW_EXTRA: "Выплата бригаде вне акта",
};

export const PAYABLE_STATUS_LABELS: Record<PayableStatus, string> = {
  OPEN: "К оплате",
  PARTIALLY_PAID: "Частично оплачено",
  PAID: "Оплачено",
  CANCELLED: "Отменено",
};
