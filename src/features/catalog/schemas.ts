import { z } from "zod";

import { EXPENSE_COLOR_KEYS } from "./expense-colors";

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

/** Категория затрат (Д-97): «через склад» — конструктив, продукты, инвентарь. */
export const expenseCategorySchema = z.object({
  id,
  name: z.string().trim().min(2, { error: "Название категории" }).max(100),
  color: z.enum(EXPENSE_COLOR_KEYS, { error: "Выберите цвет" }),
  viaWarehouse: z.boolean(),
  sortOrder: z.coerce.number<string | number>().int().min(0).max(9999),
  isActive: z.boolean(),
});
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

/** Этап работ (Д-100): кладка, монолитные, штукатурные … — для расхода, услуг и нормативов. */
export const workStageSchema = z.object({
  id,
  name: z.string().trim().min(2, { error: "Название этапа" }).max(100),
  sortOrder: z.coerce.number<string | number>().int().min(0).max(9999),
  isActive: z.boolean(),
});
export type WorkStageInput = z.infer<typeof workStageSchema>;

/** Услуга (Д-100): кран, экскаватор, геодезист, питание — с единицей учёта. */
export const serviceSchema = z.object({
  id,
  name: z.string().trim().min(2, { error: "Название услуги" }).max(200),
  unitId: z.uuid({ error: "Выберите единицу измерения" }),
  isActive: z.boolean(),
});
export type ServiceInput = z.infer<typeof serviceSchema>;
