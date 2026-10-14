import { z } from "zod";

import { isValidLogin } from "@/lib/auth/login";
import { ROLE_CODES } from "@/lib/auth/permissions";

const roles = z.array(z.enum(ROLE_CODES)).min(1, { error: "Выберите хотя бы одну роль" });

const fullName = z.string().trim().min(2, { error: "Укажите ФИО" }).max(200);

/** Новый сотрудник (Д-87): вход по логину; email — только контакт, необязателен. */
export const createMemberSchema = z.object({
  fullName,
  login: z.string().trim().refine(isValidLogin, {
    error: "Телефон в формате +992XXXXXXXXX или имя латиницей (3–32 символа)",
  }),
  email: z.union([
    z.literal(""),
    z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: "Введите корректный email" })),
  ]),
  roles,
  allProjects: z.boolean(),
  projectIds: z.array(z.uuid()),
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z.object({
  memberId: z.uuid(),
  fullName,
  phone: z.string().trim().max(50),
  isActive: z.boolean(),
  roles,
  allProjects: z.boolean(),
  projectIds: z.array(z.uuid()),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const resetMfaSchema = z.object({
  memberId: z.uuid(),
  reason: z.string().trim().min(3, { error: "Укажите причину" }).max(500),
});
export type ResetMfaInput = z.infer<typeof resetMfaSchema>;

export const resetPasswordSchema = z.object({
  memberId: z.uuid(),
  reason: z.string().trim().min(3, { error: "Укажите причину" }).max(500),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
