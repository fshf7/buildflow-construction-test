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
