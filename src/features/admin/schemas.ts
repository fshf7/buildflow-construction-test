import { z } from "zod";

import { ROLE_CODES } from "@/lib/auth/permissions";

const roles = z.array(z.enum(ROLE_CODES)).min(1, { error: "Выберите хотя бы одну роль" });

const fullName = z.string().trim().min(2, { error: "Укажите ФИО" }).max(200);

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Введите корректный email" })),
  fullName,
  roles,
  allProjects: z.boolean(),
  projectIds: z.array(z.uuid()),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

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
