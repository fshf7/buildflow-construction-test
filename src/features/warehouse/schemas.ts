import { z } from "zod";

import { decimalString } from "@/lib/decimal";

// Количества — строками из полей (запятая допустима); «0» или пусто = строку не проводить.
const qty = z.union([decimalString({ allowZero: true, message: "Количество" }), z.literal("")]);

export const quickReceiveSchema = z.object({
  receiptId: z.uuid(),
  key: z.uuid(),
  projectId: z.uuid(),
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
  stageId: z.uuid({ error: "Выберите этап работ" }),
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

// ---------------------------------------------------------------------------------------
// Склад таблицами (Д-100): строки прихода, расхода, услуг; нормативы
// ---------------------------------------------------------------------------------------
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Дата" });
const optionalId = z.union([z.uuid(), z.literal("")]);

/** Строка прихода: материал из справочника или новое наименование (тогда нужна единица). */
export const receiptRowFields = z
  .object({
    docDate: date,
    materialId: optionalId,
    materialName: z.string().trim().max(300),
    unitId: optionalId,
    quantity: decimalString({ message: "Кол-во" }),
  })
  .superRefine((v, ctx) => {
    if (!v.materialId && !v.materialName)
      ctx.addIssue({ code: "custom", path: ["materialName"], message: "Наименование" });
    if (!v.materialId && !v.unitId)
      ctx.addIssue({ code: "custom", path: ["unitId"], message: "Ед. изм." });
  });
export type ReceiptRowInput = z.infer<typeof receiptRowFields>;

/** Строка расхода: материал со склада, кол-во, бригадир; блок/этаж/этап — где применимо. */
export const issueRowFields = z
  .object({
    docDate: date,
    materialId: z.uuid({ error: "Наименование" }),
    quantity: decimalString({ message: "Кол-во" }),
    blockId: optionalId,
    floorId: optionalId,
    stageId: optionalId,
    crewId: z.uuid({ error: "Ответственный" }),
  })
  .refine((v) => !v.floorId || v.blockId, { path: ["blockId"], message: "Блок" });
export type IssueRowInput = z.infer<typeof issueRowFields>;

/** Строка услуги: услуга из справочника или новая (тогда нужна единица). */
export const serviceRowFields = z
  .object({
    docDate: date,
    serviceId: optionalId,
    serviceName: z.string().trim().max(200),
    unitId: optionalId,
    quantity: decimalString({ message: "Кол-во" }),
    blockId: optionalId,
    floorId: optionalId,
    stageId: optionalId,
    crewId: optionalId,
  })
  .superRefine((v, ctx) => {
    if (!v.serviceId && !v.serviceName)
      ctx.addIssue({ code: "custom", path: ["serviceName"], message: "Услуга" });
    if (!v.serviceId && !v.unitId)
      ctx.addIssue({ code: "custom", path: ["unitId"], message: "Ед. изм." });
    if (v.floorId && !v.blockId)
      ctx.addIssue({ code: "custom", path: ["blockId"], message: "Блок" });
  });
export type ServiceRowInput = z.infer<typeof serviceRowFields>;

/** Норматив: материал + блок + этап; 0 — удалить. */
export const normFields = z.object({
  materialId: z.uuid({ error: "Материал" }),
  blockId: z.uuid({ error: "Блок" }),
  stageId: z.uuid({ error: "Этап" }),
  quantity: decimalString({ allowZero: true, message: "Норматив" }),
  note: z.string().trim().max(300),
});
export type NormInput = z.infer<typeof normFields>;

export const sheetSaveSchema = z.object({ id: z.uuid(), key: z.uuid(), projectId: z.uuid() });
