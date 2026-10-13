import { z } from "zod";

import { decimalString } from "@/lib/decimal";

const optionalUuid = z.union([z.uuid(), z.literal("")]);

export const workActLineSchema = z.object({
  workType: z.string().trim().min(1, { error: "Выберите вид работ" }),
  blockId: optionalUuid,
  floorId: optionalUuid,
  quantity: decimalString({ message: "Объём — число, например 5000 или 12,5" }),
  note: z.string().trim().max(500),
});

export const workActSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    crewId: z.uuid({ error: "Выберите бригаду" }),
    docDate: z.iso.date({ error: "Укажите дату акта" }),
    periodFrom: z.union([z.iso.date(), z.literal("")]),
    periodTo: z.union([z.iso.date(), z.literal("")]),
    note: z.string().trim().max(1000),
    lines: z.array(workActLineSchema).min(1, { error: "Добавьте хотя бы одну строку работ" }),
  })
  .refine((v) => !v.periodFrom || !v.periodTo || v.periodFrom <= v.periodTo, {
    error: "Начало периода позже окончания",
    path: ["periodTo"],
  });
export type WorkActInput = z.infer<typeof workActSchema>;

export const WORK_ACT_OPS = [
  "submit_work_act",
  "approve_work_act",
  "reject_work_act",
  "cancel_work_act",
] as const;
export type WorkActOp = (typeof WORK_ACT_OPS)[number];
