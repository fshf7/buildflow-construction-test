import { parseArgs } from "node:util";

import { z } from "zod";

import { isEmailLogin, isValidLogin } from "../src/lib/auth/login.ts";

/** `npm run password:reset -- --login … --reason "…" --yes` */
export const passwordResetArgsSchema = z.object({
  login: z
    .string()
    .trim()
    .refine((v) => (isEmailLogin(v) ? z.email().safeParse(v).success : isValidLogin(v)), {
      error: "--login: телефон +992XXXXXXXXX, имя латиницей или email пользователя",
    }),
  reason: z.string().trim().min(3, { error: "--reason: причина сброса (обязательна)" }),
  yes: z.literal(true, {
    error: "--yes: подтвердите сброс (действие завершит все сессии пользователя)",
  }),
});

export type PasswordResetArgs = z.infer<typeof passwordResetArgsSchema>;

export function parsePasswordResetArgs(argv: string[]): PasswordResetArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      login: { type: "string" },
      reason: { type: "string" },
      yes: { type: "boolean", default: false },
    },
    strict: true,
  });
  const result = passwordResetArgsSchema.safeParse({
    login: values.login ?? "",
    reason: values.reason ?? "",
    yes: values.yes ?? false,
  });
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join("\n"));
  return result.data;
}
