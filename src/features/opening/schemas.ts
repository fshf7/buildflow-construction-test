import { z } from "zod";

import { decimalString } from "@/lib/decimal";

const date = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Дата ввода" });

export const openingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("STOCK"),
    id: z.uuid(),
    docDate: date,
    projectId: z.uuid({ error: "Выберите объект" }),
    note: z.string().trim().max(500),
    lines: z
      .array(
        z.object({
          materialId: z.uuid({ error: "Материал" }),
          quantity: decimalString({ message: "Количество" }),
        }),
      )
      .min(1),
  }),
  z.object({
    kind: z.literal("CASH"),
    id: z.uuid(),
    docDate: date,
    projectId: z.literal(""),
    note: z.string().trim().max(500),
    lines: z
      .array(
        z.object({
          accountId: z.uuid({ error: "Касса" }),
          amount: decimalString({ maxDecimals: 2, message: "Сумма" }),
        }),
      )
      .min(1),
  }),
  z.object({
    kind: z.literal("PAYABLES"),
    id: z.uuid(),
    docDate: date,
    projectId: z.literal(""),
    note: z.string().trim().max(500),
    lines: z
      .array(
        z.object({
          supplierId: z.uuid({ error: "Поставщик" }),
          projectId: z.union([z.uuid(), z.literal("")]),
          amount: decimalString({ maxDecimals: 2, message: "Сумма" }),
          currency: z.string().trim().length(3),
          basis: z.string().trim().min(3, { error: "Основание долга" }).max(300),
          dueDate: z.union([date, z.literal("")]),
        }),
      )
      .min(1),
  }),
]);
export type OpeningInput = z.infer<typeof openingSchema>;
export type OpeningKind = OpeningInput["kind"];

export const OPENING_KIND_LABELS: Record<OpeningKind, string> = {
  STOCK: "Остатки склада",
  CASH: "Остатки касс и счетов",
  PAYABLES: "Долги поставщикам",
};
