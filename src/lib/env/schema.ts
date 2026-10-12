import { z } from "zod";

/**
 * Схемы переменных окружения (без побочных эффектов — можно импортировать в тестах).
 * Переменные окружения. Публичные (NEXT_PUBLIC_*) попадают в клиентский бандл,
 * серверные — только на сервер. Секреты (SUPABASE_SECRET_KEY) никогда не имеют префикса NEXT_PUBLIC_.
 */

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z.enum(["local", "staging", "production"]),
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export const serverEnvSchema = z.object({
  // service_role / secret key: только сервер (приглашения участников). Никогда NEXT_PUBLIC_.
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Некорректные публичные переменные окружения (см. .env.example):\n${formatIssues(result.error)}`,
    );
  }
  return result.data;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Некорректные серверные переменные окружения (см. .env.example):\n${formatIssues(result.error)}`,
    );
  }
  return result.data;
}
