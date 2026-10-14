import { parseArgs } from "node:util";

import { z } from "zod";

import { isEmailLogin, isValidLogin } from "../src/lib/auth/login.ts";

/** Аргументы `npm run org:create -- --name … --admin-login … --admin-name … [--yes] [--password … | --prompt-password]`. */
export const orgCreateArgsSchema = z.object({
  name: z.string().trim().min(2, { error: "--name: название организации" }),
  // Логин первого администратора (Д-87): телефон +992…, имя латиницей или email.
  adminLogin: z
    .string()
    .trim()
    .refine((v) => (isEmailLogin(v) ? z.email().safeParse(v).success : isValidLogin(v)), {
      error: "--admin-login: телефон +992XXXXXXXXX, имя латиницей или email первого администратора",
    }),
  adminName: z.string().trim().min(2, { error: "--admin-name: ФИО администратора" }),
  yes: z.boolean(),
  // Только для локальной БД: создать пользователя сразу с паролем, без письма-приглашения.
  password: z.string().min(10, { error: "--password: не короче 10 символов" }).optional(),
  // Без SMTP (Д-78): пароль спрашивается скрыто в терминале администратора — не в аргументах и не в истории.
  promptPassword: z.boolean(),
});

export type OrgCreateArgs = z.infer<typeof orgCreateArgsSchema>;

export function parseOrgCreateArgs(argv: string[]): OrgCreateArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: "string" },
      "admin-login": { type: "string" },
      "admin-name": { type: "string" },
      password: { type: "string" },
      yes: { type: "boolean", default: false },
      "prompt-password": { type: "boolean", default: false },
    },
    strict: true,
  });
  const result = orgCreateArgsSchema.safeParse({
    name: values.name ?? "",
    adminLogin: values["admin-login"] ?? "",
    adminName: values["admin-name"] ?? "",
    password: values.password,
    yes: values.yes ?? false,
    promptPassword: values["prompt-password"] ?? false,
  });
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => i.message).join("\n"));
  }
  if (result.data.password && result.data.promptPassword) {
    throw new Error("--password и --prompt-password вместе не используются");
  }
  return result.data;
}

export function isLocalUrl(url: string): boolean {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(url).hostname);
}
