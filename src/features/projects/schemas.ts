import { z } from "zod";

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), { error: "Дата в формате ГГГГ-ММ-ДД" });

const projectFields = {
  code: z.string().trim().min(1, { error: "Укажите код объекта" }).max(30),
  name: z.string().trim().min(2, { error: "Укажите название" }).max(200),
  address: z.string().trim().max(500),
  startDate: optionalDate,
  endDate: optionalDate,
};

const datesInOrder = (v: { startDate: string; endDate: string }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;
const datesError = { error: "Окончание не раньше начала", path: ["endDate"] };

export const projectSchema = z.object(projectFields).refine(datesInOrder, datesError);
export type ProjectInput = z.infer<typeof projectSchema>;

/** Форма объекта: те же поля + «в архиве» (только при редактировании). */
export const projectFormSchema = z
  .object({ ...projectFields, archived: z.boolean() })
  .refine(datesInOrder, datesError);
export type ProjectFormInput = z.infer<typeof projectFormSchema>;

export const updateProjectSchema = z
  .object({ ...projectFields, archived: z.boolean(), id: z.uuid() })
  .refine(datesInOrder, datesError);
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const blockSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, { error: "Название блока" }).max(100),
});
export type BlockInput = z.infer<typeof blockSchema>;

export const floorSchema = z.object({
  projectId: z.uuid(),
  blockId: z.uuid(),
  name: z.string().trim().min(1, { error: "Название этажа" }).max(100),
});
export type FloorInput = z.infer<typeof floorSchema>;
