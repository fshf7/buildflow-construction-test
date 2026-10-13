import { z } from "zod";

import { decimalString } from "@/lib/decimal";

export const crewMemberSchema = z.object({
  id: z.uuid().optional(),
  crewId: z.uuid(),
  fullName: z.string().trim().min(2, { error: "Укажите ФИО" }).max(200),
  phone: z.string().trim().max(50),
  position: z.string().trim().max(100),
  isActive: z.boolean(),
});
export type CrewMemberInput = z.infer<typeof crewMemberSchema>;

export const workRateSchema = z.object({
  id: z.uuid(),
  crewId: z.uuid(),
  projectId: z.union([z.uuid(), z.literal("")]),
  workType: z.string().trim().min(2, { error: "Укажите вид работ" }).max(200),
  unitId: z.uuid({ error: "Выберите единицу" }),
  rate: decimalString({ message: "Тариф — число, например 30 или 12,5" }),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, { error: "Валюта — три буквы, например TJS" }),
  validFrom: z.iso.date({ error: "Укажите дату начала" }),
  note: z.string().trim().max(500),
});
export type WorkRateInput = z.infer<typeof workRateSchema>;
