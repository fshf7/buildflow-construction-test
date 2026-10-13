import { z } from "zod";

export const taskSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid({ error: "Выберите объект" }),
  title: z.string().trim().min(3, { error: "Что сделать — не короче 3 символов" }).max(200),
  description: z.string().trim().max(4000),
  assigneeMemberId: z.uuid({ error: "Выберите исполнителя" }),
  dueDate: z.union([z.iso.date(), z.literal("")]),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]),
  blockId: z.union([z.uuid(), z.literal("")]),
  floorId: z.union([z.uuid(), z.literal("")]),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const taskStatusSchema = z.enum([
  "NEW",
  "IN_PROGRESS",
  "ON_REVIEW",
  "DONE",
  "BLOCKED",
  "CANCELLED",
]);

export const taskCommentSchema = z.object({
  taskId: z.uuid(),
  id: z.uuid(),
  body: z.string().trim().min(1, { error: "Напишите комментарий" }).max(2000),
});
