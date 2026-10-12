import { z } from "zod";

const id = z.uuid().optional();

export const unitSchema = z.object({
  id,
  code: z.string().trim().min(1, { error: "Обозначение, напр. кг" }).max(10),
  name: z.string().trim().min(1, { error: "Название" }).max(100),
  decimals: z.coerce
    .number<string | number>()
    .int()
    .min(0, { error: "0–4" })
    .max(4, { error: "0–4" }),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const materialSchema = z.object({
  id,
  code: z.string().trim().max(50),
  name: z.string().trim().min(2, { error: "Название материала" }).max(300),
  unitId: z.uuid({ error: "Выберите единицу измерения" }),
  category: z.string().trim().max(100),
  isActive: z.boolean(),
});
export type MaterialInput = z.infer<typeof materialSchema>;

export const supplierSchema = z.object({
  id,
  name: z.string().trim().min(2, { error: "Название поставщика" }).max(300),
  taxId: z.string().trim().max(30),
  phone: z.string().trim().max(50),
  contactPerson: z.string().trim().max(200),
  address: z.string().trim().max(500),
  isActive: z.boolean(),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
