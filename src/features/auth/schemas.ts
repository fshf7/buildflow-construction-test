import { z } from "zod";

import { isEmailLogin, isValidLogin } from "@/lib/auth/login";

/** Логин (Д-87): телефон +992…, имя латиницей или email (учётные записи до Д-87). */
export const loginSchema = z.object({
  login: z
    .string()
    .trim()
    .min(1, { error: "Введите логин" })
    .refine((v) => (isEmailLogin(v) ? z.email().safeParse(v).success : isValidLogin(v)), {
      error: "Телефон +992XXXXXXXXX, имя латиницей или email",
    }),
  password: z.string().min(1, { error: "Введите пароль" }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const PASSWORD_MIN_LENGTH = 10;

export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: `Не короче ${PASSWORD_MIN_LENGTH} символов` })
      .max(72, { error: "Не длиннее 72 символов" }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { error: "Пароли не совпадают", path: ["confirm"] });

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: "Введите 6 цифр из приложения" });
