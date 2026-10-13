import { z } from "zod";

import { decimalString } from "@/lib/decimal";

/** Деньги: до 2 знаков после запятой (numeric(18,2)). */
export const money = (opts: { allowZero?: boolean; message?: string } = {}) =>
  decimalString({ maxDecimals: 2, allowZero: opts.allowZero, message: opts.message ?? "Сумма" });

export const cashAccountSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2, { error: "Название" }).max(100),
  kind: z.enum(["CASH", "BANK"]),
  currency: z.string().trim().length(3),
  bankName: z.string().trim().max(200),
  accountNumber: z.string().trim().max(50),
  projectId: z.union([z.uuid(), z.literal("")]),
  isActive: z.boolean(),
});
export type CashAccountInput = z.infer<typeof cashAccountSchema>;

export const quickCashSchema = z.object({
  id: z.uuid(),
  key: z.uuid(),
  accountId: z.uuid({ error: "Выберите кассу" }),
  direction: z.enum(["IN", "OUT"]),
  category: z.enum([
    "APARTMENT_SALE",
    "OWNER_FUNDS",
    "OTHER_INCOME",
    "SUPPLIER",
    "CREW_ACT",
    "OTHER_EXPENSE",
    "SALARY",
    "CREW_EXTRA",
  ]),
  amount: money(),
  projectId: z.union([z.uuid(), z.literal("")]),
  supplierId: z.union([z.uuid(), z.literal("")]),
  counterpartyName: z.string().trim().max(200),
  basis: z.string().trim().max(500),
  allocations: z.array(
    z.object({
      payableId: z.union([z.uuid(), z.literal("")]),
      paymentRequestId: z.union([z.uuid(), z.literal("")]),
      amount: money({ allowZero: true }),
    }),
  ),
});
export type QuickCashInput = z.infer<typeof quickCashSchema>;

export const paymentRequestSchema = z.object({
  id: z.uuid(),
  projectId: z.union([z.uuid(), z.literal("")]),
  purpose: z.enum(["OTHER_EXPENSE", "SALARY", "CREW_EXTRA"]),
  payeeCrewId: z.union([z.uuid(), z.literal("")]),
  payeeName: z.string().trim().min(2, { error: "Получатель" }).max(200),
  amount: money(),
  currency: z.string().trim().length(3),
  basis: z.string().trim().min(3, { error: "Основание" }).max(500),
  note: z.string().trim().max(500),
});
export type PaymentRequestInput = z.infer<typeof paymentRequestSchema>;

export const operationsFilterSchema = z.object({
  account: z.uuid().optional().catch(undefined),
  direction: z.enum(["IN", "OUT"]).optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  status: z.enum(["DRAFT", "POSTED", "REVERSED"]).optional().catch(undefined),
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
  reversal: z.enum(["pending"]).optional().catch(undefined),
});
export type OperationsFilter = z.infer<typeof operationsFilterSchema>;

export const payablesFilterSchema = z.object({
  supplier: z.uuid().optional().catch(undefined),
  project: z.uuid().optional().catch(undefined),
  status: z.enum(["open", "all"]).optional().catch(undefined),
});
