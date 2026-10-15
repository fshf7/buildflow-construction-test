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

export const invoiceLineSchema = z
  .object({
    materialId: z.union([z.uuid(), z.literal("")]),
    description: z.string().trim().max(300),
    unitId: z.union([z.uuid(), z.literal("")]),
    quantity: decimalString({ message: "Количество" }),
    price: decimalString({ allowZero: true, message: "Цена" }),
    purchaseRequestItemId: z.union([z.uuid(), z.literal("")]),
  })
  .refine((l) => l.materialId !== "" || (l.description !== "" && l.unitId !== ""), {
    error: "Материал или услуга с единицей",
    path: ["description"],
  });

export const invoiceDraftSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid({ error: "Выберите объект" }),
  supplierId: z.uuid({ error: "Выберите поставщика" }),
  purchaseRequestId: z.union([z.uuid(), z.literal("")]),
  supplierDocNumber: z.string().trim().min(1, { error: "Номер накладной поставщика" }).max(50),
  supplierDocDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Дата накладной" }),
  currency: z.string().trim().length(3),
  note: z.string().trim().max(1000),
  lines: z.array(invoiceLineSchema).min(1, { error: "Добавьте хотя бы одну строку" }),
});
export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;

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
