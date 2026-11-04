import { z } from "zod";

import { decimalString } from "@/lib/decimal";

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), { error: "Дата в формате ГГГГ-ММ-ДД" });

/** Строка заявки склада: только материал и количество (Д-92) — поставщика и цены в заявке нет. */
export const requestLineSchema = z.object({
  materialId: z.uuid({ error: "Выберите материал" }),
  quantity: decimalString({ message: "Количество" }),
  note: z.string().trim().max(500),
});

export const requestDraftSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid({ error: "Выберите объект" }),
  neededBy: optionalDate,
  currency: z.string().trim().length(3),
  note: z.string().trim().max(1000),
  lines: z.array(requestLineSchema).min(1, { error: "Добавьте хотя бы одну строку" }),
});
export type RequestDraftInput = z.infer<typeof requestDraftSchema>;

/** Строка накладной (Д-99): категория — у строки; цена может быть нулевой, сумма накладной — нет. */
export const invoiceLineFields = z.object({
  description: z.string().trim().min(1, { error: "Наименование" }).max(300),
  materialId: z.union([z.uuid(), z.literal("")]),
  serviceId: z.union([z.uuid(), z.literal("")]).default(""),
  categoryId: z.uuid({ error: "Категория" }),
  quantity: decimalString({ message: "Кол-во" }),
  unitId: z.uuid({ error: "Ед. изм." }),
  price: decimalString({ allowZero: true, message: "Цена" }),
});
export type InvoiceLineInput = z.infer<typeof invoiceLineFields>;

/** Накладная (Д-99): шапка — поставщик, дата, № бумажной накладной (необяз.), валюта; строки. */
export const invoiceSheetSchema = z.object({
  id: z.uuid(),
  key: z.uuid(),
  projectId: z.uuid(),
  supplierId: z.uuid({ error: "Поставщик" }),
  requestId: z.union([z.uuid(), z.literal("")]).default(""),
  docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Дата" }),
  docNumber: z.string().trim().max(50),
  currency: z.string().trim().length(3, { error: "Валюта" }),
  note: z.string().trim().max(1000),
  lines: z.array(invoiceLineFields).min(1, { error: "Добавьте хотя бы одну строку" }),
});
export type InvoiceSheetInput = z.infer<typeof invoiceSheetSchema>;

export const REQUEST_OPERATIONS = [
  "issue_purchase_request",
  "cancel_purchase_request",
  "start_purchase_review",
  "mark_purchase_discrepancy",
  "resolve_purchase_discrepancy",
  "close_purchase_request",
] as const;
export type RequestOperation = (typeof REQUEST_OPERATIONS)[number];

/** Д-92: оформление заявки (выпуск, отмена) — склад; сверка, расхождение, закрытие — бухгалтер. */
export function requestOperationPermission(
  operation: RequestOperation,
): "purchase_requests.manage" | "purchase_requests.review" {
  return operation === "issue_purchase_request" || operation === "cancel_purchase_request"
    ? "purchase_requests.manage"
    : "purchase_requests.review";
}

export const INVOICE_OPERATIONS = [
  "submit_supplier_invoice",
  "return_supplier_invoice",
  "confirm_supplier_invoice",
  "cancel_supplier_invoice",
] as const;
export type InvoiceOperation = (typeof INVOICE_OPERATIONS)[number];

export const transitionSchema = z.object({
  id: z.uuid(),
  key: z.uuid(),
  comment: z.string().trim().max(1000),
});

/** Фильтры списков (из URL). Неизвестные значения игнорируются. */
export const listFiltersSchema = z.object({
  status: z.string().optional().catch(undefined),
  project: z.uuid().optional().catch(undefined),
  supplier: z.uuid().optional().catch(undefined),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  q: z.string().trim().max(50).optional().catch(undefined),
});
export type ListFilters = z.infer<typeof listFiltersSchema>;
