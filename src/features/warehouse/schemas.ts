import { z } from "zod";

import { decimalString } from "@/lib/decimal";

// Количества — строками из полей (запятая допустима); «0» или пусто = строку не проводить.
const qty = z.union([decimalString({ allowZero: true, message: "Количество" }), z.literal("")]);

export const quickReceiveSchema = z.object({
  receiptId: z.uuid(),
  key: z.uuid(),
  projectId: z.uuid(),
  // Д-100: поставщик необязателен (часто неизвестен складу); для денег его указывает бухгалтер.
  supplierId: z.union([z.uuid(), z.literal("")]),
  requestId: z.union([z.uuid(), z.literal("")]),
  note: z.string().trim().max(500),
  lines: z
    .array(
      z.object({
        purchaseRequestItemId: z.union([z.uuid(), z.literal("")]),
        materialId: z.union([z.uuid(), z.literal("")]),
        quantity: qty,
      }),
    )
    .min(1),
});
export type QuickReceiveInput = z.infer<typeof quickReceiveSchema>;

export const quickIssueSchema = z.object({
  issueId: z.uuid(),
  key: z.uuid(),
  projectId: z.uuid(),
  crewId: z.uuid({ error: "Выберите бригаду" }),
  blockId: z.uuid({ error: "Выберите блок" }),
  floorId: z.uuid({ error: "Выберите этаж" }),
  receivedByName: z.string().trim().max(200),
  lines: z.array(z.object({ materialId: z.uuid(), quantity: qty })).min(1),
});
export type QuickIssueInput = z.infer<typeof quickIssueSchema>;

export const quickReturnSchema = z.object({
  returnId: z.uuid(),
  key: z.uuid(),
  issueId: z.uuid(),
  lines: z.array(z.object({ issueItemId: z.uuid(), quantity: qty })).min(1),
});
export type QuickReturnInput = z.infer<typeof quickReturnSchema>;

export const startCorrectionSchema = z.object({
  originalId: z.uuid(),
  newId: z.uuid(),
  reason: z.string().trim().min(3, { error: "Укажите причину" }).max(500),
  mode: z.enum(["edit", "reverse"]),
});

export const finishCorrectionSchema = z.object({
  id: z.uuid(),
  key: z.uuid(),
  projectId: z.uuid(),
  reason: z.string().trim().min(3, { error: "Укажите причину" }).max(500),
  lines: z.array(
    z.object({
      purchaseRequestItemId: z.union([z.uuid(), z.literal("")]),
      materialId: z.uuid(),
      quantity: qty,
    }),
  ),
});
export type FinishCorrectionInput = z.infer<typeof finishCorrectionSchema>;

export const crewSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, { error: "Название бригады" }).max(200),
  leaderName: z.string().trim().max(200),
  phone: z.string().trim().max(50),
  foremanMemberId: z.union([z.uuid(), z.literal("")]),
  isActive: z.boolean(),
});
export type CrewInput = z.infer<typeof crewSchema>;
