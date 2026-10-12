import { z } from "zod";

export const loginSchema = z.object({
  // Сначала нормализуем, потом проверяем формат: в zod 4 .trim() после z.email() сработал бы слишком поздно.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Введите корректный email" })),
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
